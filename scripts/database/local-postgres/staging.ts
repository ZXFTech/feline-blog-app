import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";
import { repositoryRoot, targets } from "./config";
import { cleanChildEnvironment, readEnvironmentFile, requireValue } from "./env";
import { DatabaseToolError } from "./errors";
import { localMigrationFiles, quoteIdentifier } from "./local";
import { runPrisma } from "./migrate";
import {
  classifyStagingMigrationTarget,
  classifyStagingTarget,
  type RedactedTarget,
} from "./target";
import {
  assertSafeMigrationSql,
  reconcileMigrationHistory,
  type MigrationDecision,
} from "../../ci/staging-core";
import {
  archiveTimeoutPrestate,
  decideConfigureTimeoutTransition,
  decideRollbackTimeoutTransition,
  desiredTimeoutEffectiveState,
  desiredTimeoutExplicitState,
  effectiveTimeoutStatesMatch,
  explicitTimeoutStatesMatch,
  parseTimeoutMilliseconds,
  readTimeoutPrestate,
  writeTimeoutPrestate,
  type StagingMigratorTimeoutPrestate,
  type TimeoutEffectiveState,
  type TimeoutExplicitState,
} from "./staging-timeouts";

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function stagingValues(): Promise<Record<string, string>> {
  const values = await readEnvironmentFile(".env.staging");
  if (values.POSTGRES_ENVIRONMENT !== "staging") {
    throw new DatabaseToolError("TARGET_REJECTED", ".env.staging must select staging.");
  }
  return values;
}

function stagingTls(values: Readonly<Record<string, string>>): {
  ca: string;
  rejectUnauthorized: true;
} {
  const ca = requireValue(values, "POSTGRES_SSL_CA").replace(/\\n/g, "\n");
  return { ca, rejectUnauthorized: true };
}

async function stagingClient(
  values: Readonly<Record<string, string>>,
  key: string,
  role: string
): Promise<Client> {
  const connectionString = requireValue(values, key);
  classifyStagingTarget(connectionString, role, values.POSTGRES_ENVIRONMENT);
  const client = new Client({
    connectionString,
    ssl: stagingTls(values),
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  const identity = await client.query<{ database: string; role: string }>(
    "SELECT current_database() AS database, current_user AS role"
  );
  if (identity.rows[0]?.database !== targets.stagingDatabase || identity.rows[0]?.role !== role) {
    await client.end();
    throw new DatabaseToolError("ROLE_MISMATCH", `The connected staging role is not ${role}.`);
  }
  return client;
}

async function stagingMigrationClient(
  values: Readonly<Record<string, string>>,
  verifyTimeouts = true
): Promise<Client> {
  const connectionString = requireValue(values, "POSTGRES_MIGRATION_URL");
  classifyStagingMigrationTarget(connectionString, values.POSTGRES_ENVIRONMENT);
  const client = new Client({
    connectionString,
    ssl: stagingTls(values),
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  const identity = await client.query<{ database: string; role: string }>(
    "SELECT current_database() AS database, current_user AS role"
  );
  if (
    identity.rows[0]?.database !== targets.stagingDatabase ||
    identity.rows[0]?.role !== targets.migratorRole
  ) {
    await client.end();
    throw new DatabaseToolError(
      "ROLE_MISMATCH",
      `The connected staging role is not ${targets.migratorRole}.`
    );
  }
  if (verifyTimeouts) {
    try {
      await assertEffectiveMigrationTimeouts(client, desiredTimeoutEffectiveState());
    } catch (error) {
      await client.end();
      throw error;
    }
  }
  return client;
}

function verifiedPrismaMigrationUrl(value: string, certificatePath: string): string {
  classifyStagingMigrationTarget(value);
  const url = new URL(value);
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", certificatePath);
  return url.toString();
}

async function withStagingPrismaEnvironment<T>(
  values: Readonly<Record<string, string>>,
  action: (environment: NodeJS.ProcessEnv) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "feline-prisma-ca-"));
  const certificatePath = path.join(directory, "root.crt");
  try {
    await writeFile(
      certificatePath,
      requireValue(values, "POSTGRES_SSL_CA").replace(/\\n/g, "\n"),
      { encoding: "utf8", mode: 0o600 }
    );
    return await action(
      cleanChildEnvironment([], {
        POSTGRES_MIGRATION_URL: verifiedPrismaMigrationUrl(
          requireValue(values, "POSTGRES_MIGRATION_URL"),
          certificatePath
        ),
      })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withStagingLock<T>(client: Client, action: () => Promise<T>): Promise<T> {
  const key = `${targets.stagingProjectRef}:staging-operation`;
  const result = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
    [key]
  );
  if (!result.rows[0]?.locked) {
    throw new DatabaseToolError(
      "RECOVERY_REQUIRED",
      "Another staging database operation is active."
    );
  }
  try {
    return await action();
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key])
      .catch(() => undefined);
  }
}

function timeoutEntries(config: readonly string[] | null): TimeoutExplicitState {
  const entries: TimeoutExplicitState = { lockTimeout: null, statementTimeout: null };
  for (const setting of config || []) {
    const separator = setting.indexOf("=");
    if (separator < 1) continue;
    const key = setting.slice(0, separator);
    const value = setting.slice(separator + 1);
    if (key === "lock_timeout") {
      if (entries.lockTimeout !== null) {
        throw new DatabaseToolError(
          "CONFIG_CONFLICT",
          "The staging migrator has duplicate lock_timeout role defaults."
        );
      }
      parseTimeoutMilliseconds(value);
      entries.lockTimeout = value;
    }
    if (key === "statement_timeout") {
      if (entries.statementTimeout !== null) {
        throw new DatabaseToolError(
          "CONFIG_CONFLICT",
          "The staging migrator has duplicate statement_timeout role defaults."
        );
      }
      parseTimeoutMilliseconds(value);
      entries.statementTimeout = value;
    }
  }
  return entries;
}

async function readRoleTimeoutCatalog(client: Client): Promise<TimeoutExplicitState> {
  const result = await client.query<{
    rolconfig: string[] | null;
    database_config: string[] | null;
  }>(
    `SELECT r.rolconfig,
      COALESCE((
        SELECT array_agg(setting ORDER BY setting)
        FROM pg_db_role_setting s
        JOIN pg_database d ON d.oid = s.setdatabase
        CROSS JOIN LATERAL unnest(s.setconfig) AS setting
        WHERE s.setrole = r.oid AND d.datname = $2
      ), ARRAY[]::text[]) AS database_config
    FROM pg_roles r WHERE r.rolname = $1`,
    [targets.migratorRole, targets.stagingDatabase]
  );
  const row = result.rows[0];
  if (!row) {
    throw new DatabaseToolError("ROLE_MISMATCH", "The staging migrator role does not exist.");
  }
  const databaseSpecific = timeoutEntries(row.database_config);
  if (databaseSpecific.lockTimeout !== null || databaseSpecific.statementTimeout !== null) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      "Database-specific staging migrator timeout defaults must be removed before configuration."
    );
  }
  return timeoutEntries(row.rolconfig);
}

async function readEffectiveMigrationTimeouts(client: Client): Promise<TimeoutEffectiveState> {
  const result = await client.query<{ lock_timeout: string; statement_timeout: string }>(
    "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout"
  );
  const row = result.rows[0];
  if (!row) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      "The staging migration session did not report timeout settings."
    );
  }
  return {
    lockTimeoutMs: parseTimeoutMilliseconds(row.lock_timeout),
    statementTimeoutMs: parseTimeoutMilliseconds(row.statement_timeout),
  };
}

async function assertEffectiveMigrationTimeouts(
  client: Client,
  expected: TimeoutEffectiveState
): Promise<TimeoutEffectiveState> {
  const actual = await readEffectiveMigrationTimeouts(client);
  if (!effectiveTimeoutStatesMatch(actual, expected)) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      "The staging migration session timeouts do not match the committed policy."
    );
  }
  return actual;
}

async function verifyFreshMigrationTimeouts(
  values: Readonly<Record<string, string>>,
  expected: TimeoutEffectiveState,
  attempts = 5
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let client: Client | undefined;
    try {
      client = await stagingMigrationClient(values, false);
      await assertEffectiveMigrationTimeouts(client, expected);
      return;
    } catch (error) {
      lastError = error;
    } finally {
      await client?.end().catch(() => undefined);
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 2_000)));
    }
  }
  if (
    lastError instanceof DatabaseToolError &&
    lastError.message ===
      "The staging migration session timeouts do not match the committed policy."
  ) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      "The role defaults are configured, but Session Pooler backends still report the previous timeout policy. Keep CI writes disabled and diagnose or recycle the provider pool."
    );
  }
  if (lastError instanceof DatabaseToolError) throw lastError;
  throw new DatabaseToolError(
    "CONFIG_CONFLICT",
    "Fresh Session Pooler connections did not converge on the expected timeout policy."
  );
}

async function inTransaction(client: Client, action: () => Promise<void>): Promise<void> {
  await client.query("BEGIN");
  try {
    await action();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function applyDesiredMigratorTimeouts(client: Client): Promise<void> {
  await inTransaction(client, async () => {
    await client.query(
      `ALTER ROLE ${quoteIdentifier(targets.migratorRole)} SET lock_timeout = ${quoteLiteral(
        `${targets.stagingMigrationLockTimeoutMs}ms`
      )}`
    );
    await client.query(
      `ALTER ROLE ${quoteIdentifier(targets.migratorRole)} SET statement_timeout = ${quoteLiteral(
        `${targets.stagingMigrationStatementTimeoutMs}ms`
      )}`
    );
  });
}

async function restoreMigratorTimeouts(
  client: Client,
  prestate: TimeoutExplicitState
): Promise<void> {
  await inTransaction(client, async () => {
    for (const [parameter, value] of [
      ["lock_timeout", prestate.lockTimeout],
      ["statement_timeout", prestate.statementTimeout],
    ] as const) {
      if (value === null) {
        await client.query(
          `ALTER ROLE ${quoteIdentifier(targets.migratorRole)} RESET ${parameter}`
        );
      } else {
        parseTimeoutMilliseconds(value);
        await client.query(
          `ALTER ROLE ${quoteIdentifier(targets.migratorRole)} SET ${parameter} = ${quoteLiteral(
            value
          )}`
        );
      }
    }
  });
}

function newTimeoutPrestate(
  explicit: TimeoutExplicitState,
  effectiveMs: TimeoutEffectiveState
): StagingMigratorTimeoutPrestate {
  return {
    schemaVersion: 1,
    projectRef: targets.stagingProjectRef,
    database: targets.stagingDatabase,
    role: targets.migratorRole,
    capturedAt: new Date().toISOString(),
    explicit,
    effectiveMs,
  };
}

export async function withMonitoredStagingLock<T>(
  client: Client,
  action: (signal: AbortSignal) => Promise<T>,
  heartbeatMillis = 5_000
): Promise<T> {
  return withStagingLock(client, async () => {
    const initial = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const backendPid = initial.rows[0]?.pid;
    if (!Number.isInteger(backendPid)) {
      throw new DatabaseToolError("RECOVERY_REQUIRED", "The staging lock owner is unknown.");
    }
    const controller = new AbortController();
    let heartbeatRunning = false;
    const abort = () => controller.abort();
    client.once("error", abort);
    client.once("end", abort);
    const heartbeat = setInterval(() => {
      if (heartbeatRunning || controller.signal.aborted) return;
      heartbeatRunning = true;
      void client
        .query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
        .then((result) => {
          if (result.rows[0]?.pid !== backendPid) abort();
        })
        .catch(abort)
        .finally(() => {
          heartbeatRunning = false;
        });
    }, heartbeatMillis);
    heartbeat.unref();
    try {
      const result = await action(controller.signal);
      if (controller.signal.aborted) {
        throw new DatabaseToolError(
          "RECOVERY_REQUIRED",
          "The staging migration lock connection was lost."
        );
      }
      return result;
    } finally {
      clearInterval(heartbeat);
      client.off("error", abort);
      client.off("end", abort);
    }
  });
}

export interface StagingStatus extends RedactedTarget {
  environment: "staging";
  dockerContextClass: "not-applicable";
  containerState: "not-applicable";
  dockerHealth: "not-applicable";
  sqlReady: boolean;
  effectiveCapabilities: Record<string, boolean> | "unknown";
  migrationState: string;
  migrationNames: string[];
  migrationChecksums: Record<string, string>;
  operationState: string;
  recoveryRequired: boolean;
}

export async function stagingStatus(): Promise<StagingStatus> {
  const values = await stagingValues();
  const migrationUrl = requireValue(values, "POSTGRES_MIGRATION_URL");
  const target = classifyStagingMigrationTarget(migrationUrl, values.POSTGRES_ENVIRONMENT);
  const files = await localMigrationFiles();
  const status: StagingStatus = {
    environment: "staging",
    ...target,
    dockerContextClass: "not-applicable",
    containerState: "not-applicable",
    dockerHealth: "not-applicable",
    sqlReady: false,
    effectiveCapabilities: "unknown",
    migrationState: "unknown",
    migrationNames: files.map((item) => item.name),
    migrationChecksums: Object.fromEntries(files.map((item) => [item.name, item.checksum])),
    operationState: "none",
    recoveryRequired: false,
  };
  const migration = await stagingMigrationClient(values);
  try {
    status.sqlReady = true;
    const applied = await migration.query<{ migration_name: string; checksum: string }>(
      "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
    );
    status.migrationState =
      applied.rows.length === files.length &&
      applied.rows.every(
        (row, index) =>
          row.migration_name === files[index]?.name && row.checksum === files[index]?.checksum
      )
        ? "current"
        : "drift";
  } finally {
    await migration.end();
  }
  if (values.POSTGRES_EXPORTER_URL) {
    const exporter = await stagingClient(values, "POSTGRES_EXPORTER_URL", "app_exporter");
    try {
      const capabilities = await exporter.query<{
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
        can_create: boolean;
      }>(`SELECT
          has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
          COALESCE(bool_or(has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'INSERT')), false) AS can_insert,
          COALESCE(bool_or(has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'UPDATE')), false) AS can_update,
          COALESCE(bool_or(has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'DELETE')), false) AS can_delete
        FROM pg_tables WHERE schemaname = 'public'`);
      status.effectiveCapabilities = capabilities.rows[0] || "unknown";
    } finally {
      await exporter.end();
    }
  }
  return status;
}

export async function reconcileStagingMigrations(): Promise<MigrationDecision> {
  const values = await stagingValues();
  const files = await localMigrationFiles();
  const migration = await stagingMigrationClient(values);
  try {
    const history = await migration.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at, id"
    );
    const decision = reconcileMigrationHistory(
      files,
      history.rows.map((row) => ({
        migrationName: row.migration_name,
        checksum: row.checksum,
        finishedAt: row.finished_at,
        rolledBackAt: row.rolled_back_at,
      }))
    );
    for (const pending of decision.pending) {
      const sql = await readFile(
        path.join(
          repositoryRoot,
          "prisma",
          "postgres",
          "migrations",
          pending.name,
          "migration.sql"
        ),
        "utf8"
      );
      assertSafeMigrationSql(sql, pending.name);
    }
    return decision;
  } finally {
    await migration.end();
  }
}

async function assertExporterSafety(client: Client): Promise<void> {
  const unsafe = await client.query<{
    rls_tables: number;
    executable_functions: number;
    writable_tables: number;
  }>(`SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_tables,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_depend d ON d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid AND d.deptype = 'e'
        WHERE n.nspname = 'public' AND d.objid IS NULL
          AND has_function_privilege(current_user, p.oid, 'EXECUTE')) AS executable_functions,
      (SELECT count(*)::int FROM pg_tables
        WHERE schemaname = 'public' AND (
          has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'INSERT') OR
          has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'UPDATE') OR
          has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'DELETE') OR
          has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'TRUNCATE') OR
          has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'REFERENCES') OR
          has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'TRIGGER')
        )) AS writable_tables`);
  const row = unsafe.rows[0];
  if (!row || row.rls_tables > 0 || row.executable_functions > 0 || row.writable_tables > 0) {
    throw new DatabaseToolError(
      "ROLE_MISMATCH",
      "The staging exporter has an unsafe effective capability."
    );
  }
}

async function grantExporterReadAccess(client: Client): Promise<void> {
  await client.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_exporter");
  await client.query("GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_exporter");
  await client.query("REVOKE USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM app_exporter");
  await client.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_exporter"
  );
}

export async function verifyStagingExporter(): Promise<void> {
  const values = await stagingValues();
  const exporter = await stagingClient(values, "POSTGRES_EXPORTER_URL", "app_exporter");
  try {
    await assertExporterSafety(exporter);
    const unreadable = await exporter.query<{ count: number }>(`SELECT count(*)::int AS count
      FROM pg_tables WHERE schemaname = 'public'
      AND NOT has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'SELECT')`);
    if ((unreadable.rows[0]?.count || 0) > 0) {
      throw new DatabaseToolError(
        "ROLE_MISMATCH",
        "The staging exporter cannot read every application table."
      );
    }
  } finally {
    await exporter.end();
  }
}

async function persistExporterPassword(password: string): Promise<void> {
  const filePath = path.join(repositoryRoot, ".env.staging");
  const values = dotenv.parse(await readFile(filePath));
  const existingUrl = requireValue(values, "POSTGRES_EXPORTER_URL");
  const url = new URL(existingUrl);
  url.password = password;
  values.POSTGRES_EXPORTER_URL = url.toString();
  await writeFile(
    filePath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { encoding: "utf8", mode: 0o600 }
  );
}

export async function setupStagingExporter(rotate: boolean): Promise<void> {
  if (process.env.STAGING_ROLE_SETUP_ALLOW_WRITE !== "true") {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "Set STAGING_ROLE_SETUP_ALLOW_WRITE=true for this process."
    );
  }
  const values = await stagingValues();
  const admin = await stagingClient(values, "POSTGRES_ADMIN_URL", "postgres");
  try {
    await withStagingLock(admin, async () => {
      const existing = await admin.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_exporter') AS exists"
      );
      const shouldSetPassword = !existing.rows[0]?.exists || rotate;
      const password = shouldSetPassword ? randomBytes(32).toString("base64url") : undefined;
      if (!existing.rows[0]?.exists) {
        await admin.query(
          `CREATE ROLE app_exporter LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${quoteLiteral(password || "")}`
        );
      } else {
        const role = await admin.query<{
          rolsuper: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolinherit: boolean;
          rolbypassrls: boolean;
        }>(
          "SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls FROM pg_roles WHERE rolname = 'app_exporter'"
        );
        const row = role.rows[0];
        if (
          !row ||
          row.rolsuper ||
          row.rolcreatedb ||
          row.rolcreaterole ||
          row.rolinherit ||
          row.rolbypassrls
        ) {
          throw new DatabaseToolError(
            "ROLE_MISMATCH",
            "app_exporter has stronger attributes than allowed."
          );
        }
        if (password)
          await admin.query(`ALTER ROLE app_exporter PASSWORD ${quoteLiteral(password)}`);
      }
      await admin.query(
        `GRANT CONNECT ON DATABASE ${quoteIdentifier(targets.stagingDatabase)} TO app_exporter`
      );
      await admin.query("GRANT USAGE ON SCHEMA public TO app_exporter");
      await admin.query("REVOKE CREATE ON SCHEMA public FROM app_exporter");
      const migrator = await stagingMigrationClient(values, false);
      try {
        await grantExporterReadAccess(migrator);
      } finally {
        await migrator.end();
      }
      if (password) await persistExporterPassword(password);
    });
  } finally {
    await admin.end();
  }
  await verifyStagingExporter();
}

export interface StagingMigratorTimeoutResult {
  ok: true;
  action: "configured" | "verified" | "rolled-back" | "rollback-verified";
  role: string;
  database: string;
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

async function captureEffectiveTimeouts(
  values: Readonly<Record<string, string>>
): Promise<TimeoutEffectiveState> {
  const migration = await stagingMigrationClient(values, false);
  try {
    return await readEffectiveMigrationTimeouts(migration);
  } finally {
    await migration.end();
  }
}

export async function configureStagingMigratorTimeouts(): Promise<StagingMigratorTimeoutResult> {
  if (process.env.STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE !== "true") {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "Set STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true for this process."
    );
  }
  const values = await stagingValues();
  classifyStagingMigrationTarget(
    requireValue(values, "POSTGRES_MIGRATION_URL"),
    values.POSTGRES_ENVIRONMENT
  );
  const admin = await stagingClient(values, "POSTGRES_ADMIN_URL", "postgres");
  try {
    return await withStagingLock(admin, async () => {
      const current = await readRoleTimeoutCatalog(admin);
      let prestate = await readTimeoutPrestate();
      if (!prestate) {
        prestate = newTimeoutPrestate(current, await captureEffectiveTimeouts(values));
        await writeTimeoutPrestate(prestate);
      }
      const transition = decideConfigureTimeoutTransition(current, prestate.explicit);
      if (transition === "apply") await applyDesiredMigratorTimeouts(admin);
      const configured = await readRoleTimeoutCatalog(admin);
      if (!explicitTimeoutStatesMatch(configured, desiredTimeoutExplicitState())) {
        throw new DatabaseToolError(
          "CONFIG_CONFLICT",
          "The staging migrator timeout role defaults were not configured."
        );
      }
      const expected = desiredTimeoutEffectiveState();
      await verifyFreshMigrationTimeouts(values, expected);
      return {
        ok: true,
        action: transition === "apply" ? "configured" : "verified",
        role: targets.migratorRole,
        database: targets.stagingDatabase,
        ...expected,
      };
    });
  } finally {
    await admin.end();
  }
}

export async function rollbackStagingMigratorTimeouts(): Promise<StagingMigratorTimeoutResult> {
  if (process.env.STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE !== "true") {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "Set STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true for this process."
    );
  }
  const values = await stagingValues();
  classifyStagingMigrationTarget(
    requireValue(values, "POSTGRES_MIGRATION_URL"),
    values.POSTGRES_ENVIRONMENT
  );
  const prestate = await readTimeoutPrestate();
  if (!prestate) {
    throw new DatabaseToolError(
      "RECOVERY_REQUIRED",
      "The staging migrator timeout prestate is missing or already consumed."
    );
  }
  const admin = await stagingClient(values, "POSTGRES_ADMIN_URL", "postgres");
  try {
    return await withStagingLock(admin, async () => {
      const current = await readRoleTimeoutCatalog(admin);
      const transition = decideRollbackTimeoutTransition(current, prestate.explicit);
      if (transition === "apply") await restoreMigratorTimeouts(admin, prestate.explicit);
      const restored = await readRoleTimeoutCatalog(admin);
      if (!explicitTimeoutStatesMatch(restored, prestate.explicit)) {
        throw new DatabaseToolError(
          "RECOVERY_REQUIRED",
          "The staging migrator timeout role defaults were not restored."
        );
      }
      await verifyFreshMigrationTimeouts(values, prestate.effectiveMs);
      await archiveTimeoutPrestate();
      return {
        ok: true,
        action: transition === "apply" ? "rolled-back" : "rollback-verified",
        role: targets.migratorRole,
        database: targets.stagingDatabase,
        ...prestate.effectiveMs,
      };
    });
  } finally {
    await admin.end();
  }
}

export async function deployStaging(): Promise<void> {
  if (process.env.STAGING_MIGRATION_ALLOW_WRITE !== "true") {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "Set STAGING_MIGRATION_ALLOW_WRITE=true for this process."
    );
  }
  const values = await stagingValues();
  classifyStagingMigrationTarget(
    requireValue(values, "POSTGRES_MIGRATION_URL"),
    values.POSTGRES_ENVIRONMENT
  );
  const migration = await stagingMigrationClient(values);
  try {
    await withMonitoredStagingLock(migration, async (signal) => {
      await withStagingPrismaEnvironment(values, async (environment) => {
        await runPrisma(["migrate", "deploy"], environment, {
          signal,
          killGracePeriodMillis: 10_000,
        });
      });
    });
  } finally {
    await migration.end();
  }
}

export interface StagingMigrationProbeResult extends RedactedTarget {
  ok: true;
  connections: 2;
  databaseRole: string;
  database: string;
  lockTimeoutMs: number;
  statementTimeoutMs: number;
  advisoryLock: "verified";
  prismaStatus: "reachable";
}

export async function probeStagingMigration(
  configuredValues?: Readonly<Record<string, string>>
): Promise<StagingMigrationProbeResult> {
  const values = configuredValues || (await stagingValues());
  const target = classifyStagingMigrationTarget(
    requireValue(values, "POSTGRES_MIGRATION_URL"),
    values.POSTGRES_ENVIRONMENT
  );
  const controller = await stagingMigrationClient(values);
  let peer: Client | undefined;
  const probeKey = `${targets.stagingProjectRef}:staging-probe:${process.env.GITHUB_RUN_ID || process.pid}:${process.env.GITHUB_RUN_ATTEMPT || "local"}`;
  try {
    peer = await stagingMigrationClient(values);
    const expectedTimeouts = desiredTimeoutEffectiveState();
    await assertEffectiveMigrationTimeouts(controller, expectedTimeouts);
    await assertEffectiveMigrationTimeouts(peer, expectedTimeouts);
    const lock = await controller.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [probeKey]
    );
    if (!lock.rows[0]?.locked) {
      throw new DatabaseToolError("RECOVERY_REQUIRED", "The staging probe lock is unavailable.");
    }
    try {
      await peer.query("SELECT 1");
      await withStagingPrismaEnvironment(values, async (environment) => {
        await runPrisma(["migrate", "status"], environment);
      });
    } finally {
      await controller
        .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [probeKey])
        .catch(() => undefined);
    }
    return {
      ok: true,
      ...target,
      connections: 2,
      databaseRole: targets.migratorRole,
      ...expectedTimeouts,
      advisoryLock: "verified",
      prismaStatus: "reachable",
    };
  } finally {
    await peer?.end().catch(() => undefined);
    await controller.end().catch(() => undefined);
  }
}

export {
  applyDesiredMigratorTimeouts,
  assertExporterSafety,
  assertEffectiveMigrationTimeouts,
  grantExporterReadAccess,
  stagingMigrationClient,
  stagingClient,
  stagingTls,
  stagingValues,
  readEffectiveMigrationTimeouts,
  readRoleTimeoutCatalog,
  restoreMigratorTimeouts,
  verifiedPrismaMigrationUrl,
  withStagingPrismaEnvironment,
  withStagingLock,
};
