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
import { classifyStagingTarget, type RedactedTarget } from "./target";
import {
  assertSafeMigrationSql,
  reconcileMigrationHistory,
  type MigrationDecision,
} from "../../ci/staging-core";

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
  const target = classifyStagingTarget(
    migrationUrl,
    targets.migratorRole,
    values.POSTGRES_ENVIRONMENT
  );
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
  const migration = await stagingClient(values, "POSTGRES_MIGRATION_URL", targets.migratorRole);
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
  const migration = await stagingClient(values, "POSTGRES_MIGRATION_URL", targets.migratorRole);
  try {
    await migration.query("SET lock_timeout = '5s'");
    await migration.query("SET statement_timeout = '120s'");
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
      const migrator = await stagingClient(values, "POSTGRES_MIGRATION_URL", targets.migratorRole);
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

export async function deployStaging(): Promise<void> {
  if (process.env.STAGING_MIGRATION_ALLOW_WRITE !== "true") {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "Set STAGING_MIGRATION_ALLOW_WRITE=true for this process."
    );
  }
  const values = await stagingValues();
  classifyStagingTarget(
    requireValue(values, "POSTGRES_MIGRATION_URL"),
    targets.migratorRole,
    values.POSTGRES_ENVIRONMENT
  );
  const migration = await stagingClient(values, "POSTGRES_MIGRATION_URL", targets.migratorRole);
  try {
    await withStagingLock(migration, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "feline-prisma-ca-"));
      const certificatePath = path.join(directory, "root.crt");
      try {
        await writeFile(
          certificatePath,
          requireValue(values, "POSTGRES_SSL_CA").replace(/\\n/g, "\n"),
          { encoding: "utf8", mode: 0o600 }
        );
        const migrationUrl = new URL(requireValue(values, "POSTGRES_MIGRATION_URL"));
        migrationUrl.searchParams.set("sslmode", "verify-full");
        migrationUrl.searchParams.set("sslrootcert", certificatePath);
        await runPrisma(
          ["migrate", "deploy"],
          cleanChildEnvironment([], {
            POSTGRES_MIGRATION_URL: migrationUrl.toString(),
          })
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  } finally {
    await migration.end();
  }
}

export {
  assertExporterSafety,
  grantExporterReadAccess,
  stagingClient,
  stagingTls,
  stagingValues,
  withStagingLock,
};
