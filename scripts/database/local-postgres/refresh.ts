import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { repositoryRoot, targets } from "./config";
import { cleanChildEnvironment, requireValue } from "./env";
import { DatabaseToolError } from "./errors";
import { withHostLock } from "./lock";
import {
  connect,
  ensureLedger,
  localFiles,
  localMigrationFiles,
  quoteIdentifier,
  reconcileDatabasePrivileges,
} from "./local";
import { runPrisma } from "./migrate";
import { runCommand } from "./process";
import { stagingClient, stagingValues } from "./staging";

export interface InventoryTable {
  schema: string;
  name: string;
  count: number;
}

function createInactivityTimeout(
  timeoutMs: number,
  onTimeout: () => void
): { activity: () => void; clear: () => void } {
  let timeout: NodeJS.Timeout;
  const activity = (): void => {
    clearTimeout(timeout);
    timeout = setTimeout(onTimeout, timeoutMs);
    timeout.unref();
  };
  activity();
  return { activity, clear: () => clearTimeout(timeout) };
}

interface LedgerRow {
  operation_id: string;
  owner_token: string;
  candidate_oid: number | null;
  previous_oid: number | null;
  candidate_name: string | null;
  previous_name: string | null;
  state: string;
}

function quoteQualified(schema: string, table: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function candidateUrl(baseUrl: string, database: string, role?: string, password?: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  if (role) url.username = role;
  if (password) url.password = password;
  return url.toString();
}

async function inventory(client: Client): Promise<InventoryTable[]> {
  const unsupported = await client.query<{
    partitioned: number;
    foreign_tables: number;
    materialized_views: number;
    rls: number;
    triggers: number;
    large_objects: number;
  }>(`SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'p') AS partitioned,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'f') AS foreign_tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'm') AS materialized_views,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS triggers,
      (SELECT count(*)::int FROM pg_largeobject_metadata) AS large_objects`);
  const unsafe = unsupported.rows[0];
  if (!unsafe || Object.values(unsafe).some((value) => Number(value) > 0)) {
    throw new DatabaseToolError(
      "SNAPSHOT_FAILED",
      "The database contains an unsupported application object."
    );
  }
  const tables = await client.query<{
    schema: string;
    name: string;
  }>(`SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname`);
  const result: InventoryTable[] = [];
  for (const table of tables.rows) {
    const count = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoteQualified(table.schema, table.name)}`
    );
    result.push({ ...table, count: Number(count.rows[0]?.count || 0) });
  }
  return result;
}

async function assertMigrationCompatibility(source: Client): Promise<void> {
  const files = await localMigrationFiles();
  const applied = await source.query<{
    migration_name: string;
    checksum: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
    logs: string | null;
  }>(
    "SELECT migration_name, checksum, finished_at, rolled_back_at, logs FROM _prisma_migrations ORDER BY migration_name"
  );
  if (
    applied.rows.length !== files.length ||
    applied.rows.some(
      (row, index) =>
        row.migration_name !== files[index]?.name ||
        row.checksum !== files[index]?.checksum ||
        !row.finished_at ||
        row.rolled_back_at ||
        row.logs
    )
  ) {
    throw new DatabaseToolError(
      "MIGRATION_DRIFT",
      "Staging migrations do not match the working tree."
    );
  }
}

function pgEnvironment(urlValue: string, tls: boolean): Record<string, string> {
  const url = new URL(urlValue);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    ...(tls
      ? { PGSSLMODE: "verify-full", PGSSLROOTCERT: "/tls/root.crt" }
      : { PGSSLMODE: "disable" }),
  };
}

async function writeDockerEnvironment(
  filePath: string,
  values: Record<string, string>
): Promise<void> {
  await writeFile(
    filePath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value.replaceAll("\n", "\\n")}`)
      .join("\n") + "\n",
    { encoding: "utf8", mode: 0o600 }
  );
}

async function streamDumpRestore(options: {
  sourceUrl: string;
  targetUrl: string;
  certificate: string;
  snapshot: string;
  tables: InventoryTable[];
  sourceTls?: boolean;
  timeoutMs?: number;
}): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "feline-refresh-"));
  const sourceFile = path.join(directory, "source.env");
  const targetFile = path.join(directory, "target.env");
  const certificateFile = path.join(directory, "root.crt");
  const streamId = randomBytes(8).toString("hex");
  const dumpContainer = `feline-refresh-dump-${streamId}`;
  const restoreContainer = `feline-refresh-restore-${streamId}`;
  const sourceTls = options.sourceTls ?? true;
  const targetDatabase = decodeURIComponent(new URL(options.targetUrl).pathname.slice(1));
  try {
    await Promise.all([
      writeDockerEnvironment(sourceFile, pgEnvironment(options.sourceUrl, sourceTls)),
      writeDockerEnvironment(
        targetFile,
        pgEnvironment(options.targetUrl.replace("127.0.0.1", "host.docker.internal"), false)
      ),
      writeFile(certificateFile, options.certificate, { encoding: "utf8", mode: 0o600 }),
    ]);
    const tableArguments = options.tables.flatMap((table) => [
      "--table",
      `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`,
    ]);
    const sourceArgs = [
      "run",
      "--rm",
      "--name",
      dumpContainer,
      "--env-file",
      sourceFile,
      ...(sourceTls ? ["--volume", `${certificateFile}:/tls/root.crt:ro`] : []),
      targets.postgresImage,
      "pg_dump",
      "--format=custom",
      "--data-only",
      "--no-owner",
      "--no-acl",
      "--snapshot",
      options.snapshot,
      ...tableArguments,
    ];
    const targetArgs = [
      "run",
      "--rm",
      "--interactive",
      "--name",
      restoreContainer,
      "--env-file",
      targetFile,
      targets.postgresImage,
      "pg_restore",
      "--dbname",
      targetDatabase,
      "--data-only",
      "--no-owner",
      "--no-acl",
      "--single-transaction",
      "--exit-on-error",
    ];
    await new Promise<void>((resolve, reject) => {
      const dump = spawn("docker", sourceArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const restore = spawn("docker", targetArgs, {
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
      });
      let dumpCode: number | null = null;
      let restoreCode: number | null = null;
      let settled = false;
      let failure: DatabaseToolError | undefined;
      let restoreDiagnostic = "";
      const terminate = (): void => {
        dump.stdout?.unpipe(restore.stdin!);
        restore.stdin?.destroy();
        dump.kill();
        restore.kill();
      };
      const finish = (): void => {
        if (settled || dumpCode === null || restoreCode === null) return;
        settled = true;
        inactivityTimeout.clear();
        if (!failure && dumpCode === 0 && restoreCode === 0) resolve();
        else
          reject(
            failure ||
              new DatabaseToolError(
                "RESTORE_FAILED",
                "The streamed restore failed.",
                "dump-restore"
              )
          );
      };
      const inactivityTimeout = createInactivityTimeout(options.timeoutMs ?? 120_000, () => {
        failure = new DatabaseToolError(
          "RESTORE_FAILED",
          "The streamed restore timed out.",
          "dump-restore"
        );
        terminate();
      });
      dump.stdout?.on("data", inactivityTimeout.activity);
      dump.once("error", () => {
        failure = new DatabaseToolError("SNAPSHOT_FAILED", "The dump process could not start.");
        terminate();
      });
      restore.once("error", () => {
        failure = new DatabaseToolError("RESTORE_FAILED", "The restore process could not start.");
        terminate();
      });
      dump.once("close", (code) => {
        inactivityTimeout.activity();
        dumpCode = code ?? 1;
        if (dumpCode !== 0 && !failure) {
          failure = new DatabaseToolError(
            "SNAPSHOT_FAILED",
            "The dump producer failed.",
            "dump-producer"
          );
        }
        restore.stdin?.end();
        if (dumpCode !== 0) restore.kill();
        finish();
      });
      restore.once("close", (code) => {
        restoreCode = code ?? 1;
        if (restoreCode !== 0 && !failure) {
          const category = /connect|host|authentication/i.test(restoreDiagnostic)
            ? "connection"
            : /input file|magic string|end of file|archive/i.test(restoreDiagnostic)
              ? "archive"
              : /constraint|duplicate key|violates/i.test(restoreDiagnostic)
                ? "constraint"
                : /permission|must be owner/i.test(restoreDiagnostic)
                  ? "permission"
                  : /does not exist|undefined/i.test(restoreDiagnostic)
                    ? "missing-object"
                    : /option|cannot be used together/i.test(restoreDiagnostic)
                      ? "options"
                      : "other";
          failure = new DatabaseToolError(
            "RESTORE_FAILED",
            "The restore consumer failed.",
            `restore-consumer-${category}`
          );
        }
        if (restoreCode !== 0) dump.kill();
        finish();
      });
      dump.stdout?.pipe(restore.stdin!);
      dump.stderr?.resume();
      restore.stderr?.on("data", (chunk: Buffer) => {
        if (restoreDiagnostic.length < 8_192) restoreDiagnostic += chunk.toString();
      });
    });
  } finally {
    await Promise.all(
      [dumpContainer, restoreContainer].map((container) =>
        runCommand("docker", ["rm", "--force", container], {
          code: "RESTORE_FAILED",
          phase: "dump-restore-cleanup",
        }).catch(() => undefined)
      )
    );
    await rm(directory, { recursive: true, force: true });
  }
}

async function ledgerState(
  admin: Client,
  operationId: string,
  state: string,
  intent?: Record<string, unknown>,
  result?: Record<string, unknown>
): Promise<void> {
  await admin.query(
    `UPDATE feline_tool.refresh_operations
      SET state = $2, intent = COALESCE($3::jsonb, intent), result = COALESCE($4::jsonb, result),
          heartbeat = now(), updated_at = now() WHERE operation_id = $1`,
    [
      operationId,
      state,
      intent ? JSON.stringify(intent) : null,
      result ? JSON.stringify(result) : null,
    ]
  );
}

async function databaseOid(admin: Client, name: string): Promise<number> {
  const result = await admin.query<{ oid: number }>(
    "SELECT oid FROM pg_database WHERE datname = $1",
    [name]
  );
  const oid = result.rows[0]?.oid;
  if (!oid) throw new DatabaseToolError("OWNERSHIP_AMBIGUOUS", `Database ${name} was not found.`);
  return oid;
}

async function fence(
  admin: Client,
  operationId: string,
  databases: readonly string[]
): Promise<void> {
  await ledgerState(admin, operationId, "fence_intent", { databases });
  for (const database of databases) {
    await admin.query(`REVOKE CONNECT ON DATABASE ${quoteIdentifier(database)} FROM PUBLIC`);
    await admin.query(
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(database)} FROM ${quoteIdentifier(targets.runtimeRole)}, ${quoteIdentifier(targets.migratorRole)}`
    );
  }
  const sessions = await admin.query<{ database: string; count: string }>(
    "SELECT datname AS database, count(*)::text AS count FROM pg_stat_activity WHERE datname = ANY($1) AND pid <> pg_backend_pid() GROUP BY datname",
    [databases]
  );
  if (sessions.rows.some((row) => Number(row.count) > 0)) {
    throw new DatabaseToolError("ACTIVE_CONNECTIONS", "Application connections are still active.");
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = await admin.query(
    "SELECT 1 FROM pg_stat_activity WHERE datname = ANY($1) AND pid <> pg_backend_pid() LIMIT 1",
    [databases]
  );
  if (second.rowCount)
    throw new DatabaseToolError("ACTIVE_CONNECTIONS", "A connection entered during the fence.");
  await ledgerState(admin, operationId, "both_fenced", undefined, { fenced: true });
}

async function grantRuntimeAdmission(admin: Client, database: string): Promise<void> {
  await admin.query(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(targets.runtimeRole)}, ${quoteIdentifier(targets.migratorRole)}`
  );
}

async function controlledSmoke(
  adminUrl: string,
  database: string,
  tables: InventoryTable[]
): Promise<void> {
  const client = await connect(candidateUrl(adminUrl, database));
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${quoteIdentifier(targets.runtimeRole)}`);
    for (const table of tables) {
      await client.query(`SELECT * FROM ${quoteQualified(table.schema, table.name)} LIMIT 0`);
    }
    const id = randomUUID();
    const nonce = randomBytes(16).toString("hex");
    await client.query(
      `INSERT INTO public."_app_postgres_connection_probe" (id, nonce, value, "updatedAt") VALUES ($1, $2, 'refresh', now())`,
      [id, nonce]
    );
    await client.query(
      `UPDATE public."_app_postgres_connection_probe" SET value = 'checked', "updatedAt" = now() WHERE id = $1`,
      [id]
    );
    await client.query(`DELETE FROM public."_app_postgres_connection_probe" WHERE id = $1`, [id]);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function repairSequences(client: Client, tables: InventoryTable[]): Promise<void> {
  const sequences = await client.query<{
    sequence_schema: string;
    sequence_name: string;
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(`SELECT sn.nspname AS sequence_schema, s.relname AS sequence_name,
      tn.nspname AS table_schema, t.relname AS table_name, a.attname AS column_name
    FROM pg_class s
    JOIN pg_namespace sn ON sn.oid = s.relnamespace
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND tn.nspname = 'public'`);
  const allowed = new Set(tables.map((table) => `${table.schema}.${table.name}`));
  for (const sequence of sequences.rows) {
    if (!allowed.has(`${sequence.table_schema}.${sequence.table_name}`)) continue;
    const maximum = await client.query<{ maximum: string | null }>(
      `SELECT max(${quoteIdentifier(sequence.column_name)})::text AS maximum FROM ${quoteQualified(sequence.table_schema, sequence.table_name)}`
    );
    const value = maximum.rows[0]?.maximum;
    await client.query("SELECT setval($1::regclass, $2::bigint, $3)", [
      `${quoteIdentifier(sequence.sequence_schema)}.${quoteIdentifier(sequence.sequence_name)}`,
      value || "1",
      Boolean(value),
    ]);
  }
}

export async function refreshLocalFromStaging(): Promise<void> {
  if (
    process.env.STAGING_DATA_COPY_ALLOW !== "true" ||
    process.env.STAGING_DATA_COPY_TRUSTED_WORKSTATION !== "feline-blog-local-sensitive-copy"
  ) {
    throw new DatabaseToolError("TARGET_REJECTED", "The staging copy process gates are missing.");
  }
  if (
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV
  ) {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "Staging data copy is disabled in CI and Preview."
    );
  }
  await withHostLock("local-refresh", async () => {
    const context = await import("./process").then(({ runCommand }) =>
      runCommand("docker", ["context", "show"])
    );
    if (!["default", "desktop-linux"].includes(context.stdout.trim())) {
      throw new DatabaseToolError(
        "TARGET_REJECTED",
        "Staging data copy requires a local Docker context."
      );
    }
    const staging = await stagingValues();
    const { development, shadow } = await localFiles();
    const sourceUrl = requireValue(staging, "POSTGRES_EXPORTER_URL");
    const adminUrl = requireValue(shadow, "POSTGRES_ADMIN_URL");
    const localMigrationUrl = requireValue(development, "POSTGRES_MIGRATION_URL");
    const admin = await connect(adminUrl);
    const operationId = randomBytes(16).toString("hex");
    const ownerToken = randomUUID();
    const candidateName = `feline_blog_refresh_${operationId}`;
    const previousName = `feline_blog_previous_${operationId}`;
    let source: Client | undefined;
    try {
      const locked = await admin.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [`${targets.composeProject}:database-operation`]
      );
      if (!locked.rows[0]?.locked)
        throw new DatabaseToolError("RECOVERY_REQUIRED", "Another local operation is active.");
      await ensureLedger(admin);
      const incomplete = await admin.query(
        "SELECT 1 FROM feline_tool.refresh_operations WHERE state NOT IN ('complete', 'rolled_back') LIMIT 1"
      );
      if (incomplete.rowCount)
        throw new DatabaseToolError("RECOVERY_REQUIRED", "An earlier refresh requires recovery.");
      await admin.query(
        `INSERT INTO feline_tool.refresh_operations
        (operation_id, operation, owner_token, repository_identity, worktree_path, compose_project,
         process_identity, candidate_name, previous_name, state)
        VALUES ($1, 'refresh', $2, $3, $4, $5, $6, $7, $8, 'planned')`,
        [
          operationId,
          ownerToken,
          "feline-blog-app",
          repositoryRoot,
          targets.composeProject,
          `${process.pid}:${Date.now() - Math.round(process.uptime() * 1000)}`,
          candidateName,
          previousName,
        ]
      );

      source = await stagingClient(staging, "POSTGRES_EXPORTER_URL", "app_exporter");
      await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const snapshotResult = await source.query<{ snapshot: string }>(
        "SELECT pg_export_snapshot() AS snapshot"
      );
      const snapshot = snapshotResult.rows[0]?.snapshot;
      if (!snapshot)
        throw new DatabaseToolError("SNAPSHOT_FAILED", "The staging snapshot was not exported.");
      await assertMigrationCompatibility(source);
      const sourceInventory = await inventory(source);

      await admin.query(
        `CREATE DATABASE ${quoteIdentifier(candidateName)} OWNER ${quoteIdentifier(targets.adminRole)}`
      );
      const candidateOid = await databaseOid(admin, candidateName);
      const previousOid = await databaseOid(admin, targets.developmentDatabase);
      await admin.query(
        "UPDATE feline_tool.refresh_operations SET candidate_oid = $2, previous_oid = $3, state = 'candidate_created', updated_at = now() WHERE operation_id = $1",
        [operationId, candidateOid, previousOid]
      );
      await admin.query(`REVOKE CONNECT ON DATABASE ${quoteIdentifier(candidateName)} FROM PUBLIC`);
      await admin.query(
        `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(candidateName)} TO ${quoteIdentifier(targets.migratorRole)}`
      );
      await reconcileDatabasePrivileges(adminUrl, candidateName);
      const candidateMigrationUrl = candidateUrl(localMigrationUrl, candidateName);
      await runPrisma(
        ["migrate", "deploy"],
        cleanChildEnvironment([], { POSTGRES_MIGRATION_URL: candidateMigrationUrl })
      );
      await ledgerState(admin, operationId, "migrated");
      const candidateAdminUrl = candidateUrl(adminUrl, candidateName);
      const candidate = await connect(candidateAdminUrl);
      let foreignKeys: Array<{
        table_schema: string;
        table_name: string;
        name: string;
        definition: string;
      }> = [];
      try {
        const candidateInventory = await inventory(candidate);
        if (
          candidateInventory.map((item) => item.name).join("\0") !==
          sourceInventory.map((item) => item.name).join("\0")
        ) {
          throw new DatabaseToolError(
            "MIGRATION_DRIFT",
            "Staging and candidate table inventories differ."
          );
        }
        for (const table of candidateInventory) {
          if (table.count > 0)
            await candidate.query(
              `TRUNCATE TABLE ${quoteQualified(table.schema, table.name)} CASCADE`
            );
        }
        const keys = await candidate.query<{
          table_schema: string;
          table_name: string;
          name: string;
          definition: string;
        }>(`SELECT n.nspname AS table_schema, c.relname AS table_name, con.conname AS name,
            pg_get_constraintdef(con.oid, true) AS definition
          FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND con.contype = 'f' ORDER BY c.relname, con.conname`);
        foreignKeys = keys.rows;
        for (const key of foreignKeys) {
          await candidate.query(
            `ALTER TABLE ${quoteQualified(key.table_schema, key.table_name)} DROP CONSTRAINT ${quoteIdentifier(key.name)}`
          );
        }
      } finally {
        await candidate.end();
      }
      await streamDumpRestore({
        sourceUrl,
        targetUrl: candidateAdminUrl,
        certificate: requireValue(staging, "POSTGRES_SSL_CA").replace(/\\n/g, "\n"),
        snapshot,
        tables: sourceInventory,
      });
      await source.query("ROLLBACK");
      await source.end();
      source = undefined;
      const validate = await connect(candidateAdminUrl);
      try {
        for (const key of foreignKeys) {
          await validate.query(
            `ALTER TABLE ${quoteQualified(key.table_schema, key.table_name)} ADD CONSTRAINT ${quoteIdentifier(key.name)} ${key.definition}`
          );
        }
        await repairSequences(validate, sourceInventory);
        const restored = await inventory(validate);
        for (const [index, item] of sourceInventory.entries()) {
          if (restored[index]?.name !== item.name || restored[index]?.count !== item.count) {
            throw new DatabaseToolError(
              "RESTORE_FAILED",
              `Row count validation failed for ${item.name}.`
            );
          }
        }
        await validate.query(
          `GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(targets.runtimeRole)}`
        );
        await validate.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(targets.runtimeRole)}`
        );
        await validate.query(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(targets.runtimeRole)}`
        );
      } finally {
        await validate.end();
      }
      await ledgerState(admin, operationId, "validated");
      await fence(admin, operationId, [targets.developmentDatabase, candidateName]);
      await ledgerState(admin, operationId, "old_rename_intent", {
        oid: previousOid,
        from: targets.developmentDatabase,
        to: previousName,
      });
      await admin.query(
        `ALTER DATABASE ${quoteIdentifier(targets.developmentDatabase)} RENAME TO ${quoteIdentifier(previousName)}`
      );
      await ledgerState(admin, operationId, "old_renamed", undefined, {
        oid: previousOid,
        name: previousName,
      });
      await ledgerState(admin, operationId, "candidate_rename_intent", {
        oid: candidateOid,
        from: candidateName,
        to: targets.developmentDatabase,
      });
      await admin.query(
        `ALTER DATABASE ${quoteIdentifier(candidateName)} RENAME TO ${quoteIdentifier(targets.developmentDatabase)}`
      );
      await ledgerState(admin, operationId, "candidate_renamed", undefined, {
        oid: candidateOid,
        name: targets.developmentDatabase,
      });
      await controlledSmoke(adminUrl, targets.developmentDatabase, sourceInventory);
      await ledgerState(admin, operationId, "smoke_passed", undefined, {
        canonicalOid: candidateOid,
      });
      await grantRuntimeAdmission(admin, targets.developmentDatabase);
      await ledgerState(admin, operationId, "committed");
      await ledgerState(admin, operationId, "cleanup_intent", {
        oid: previousOid,
        name: previousName,
      });
      await admin.query(`DROP DATABASE ${quoteIdentifier(previousName)}`);
      await ledgerState(admin, operationId, "complete", undefined, { rowCounts: sourceInventory });
    } catch (error) {
      await source?.query("ROLLBACK").catch(() => undefined);
      await source?.end().catch(() => undefined);
      await recoverOperation(admin, operationId).catch(() => undefined);
      throw error;
    } finally {
      await admin
        .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
          `${targets.composeProject}:database-operation`,
        ])
        .catch(() => undefined);
      await admin.end();
    }
  });
}

async function nameForOid(admin: Client, oid: number | null): Promise<string | undefined> {
  if (!oid) return undefined;
  const result = await admin.query<{ name: string }>(
    "SELECT datname AS name FROM pg_database WHERE oid = $1",
    [oid]
  );
  return result.rows[0]?.name;
}

async function recoverOperation(admin: Client, operationId?: string): Promise<void> {
  await ensureLedger(admin);
  const result = await admin.query<LedgerRow>(
    `SELECT operation_id, owner_token, candidate_oid, previous_oid, candidate_name, previous_name, state
      FROM feline_tool.refresh_operations
      WHERE ($1::text IS NULL OR operation_id = $1) AND state NOT IN ('complete', 'rolled_back')
      ORDER BY started_at DESC LIMIT 1`,
    [operationId || null]
  );
  const row = result.rows[0];
  if (!row) {
    if (operationId) {
      throw new DatabaseToolError(
        "RECOVERY_REQUIRED",
        `Refresh operation ${operationId} was not found or does not require recovery.`
      );
    }
    return;
  }
  const candidateCurrentName = await nameForOid(admin, row.candidate_oid);
  const previousCurrentName = await nameForOid(admin, row.previous_oid);
  const committed = ["smoke_passed", "committed", "cleanup_intent", "cleanup_pending"].includes(
    row.state
  );
  if (committed) {
    if (candidateCurrentName !== targets.developmentDatabase) {
      throw new DatabaseToolError(
        "OWNERSHIP_AMBIGUOUS",
        "The committed candidate OID is not the canonical database."
      );
    }
    await grantRuntimeAdmission(admin, targets.developmentDatabase);
    if (previousCurrentName === row.previous_name) {
      const active = await admin.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname = $1 LIMIT 1",
        [row.previous_name]
      );
      if (active.rowCount) {
        await ledgerState(admin, row.operation_id, "cleanup_pending");
        return;
      }
      await admin.query(`DROP DATABASE ${quoteIdentifier(row.previous_name || "")}`);
    }
    await ledgerState(admin, row.operation_id, "complete");
    return;
  }
  if (previousCurrentName === row.previous_name) {
    if (candidateCurrentName === targets.developmentDatabase) {
      await admin.query(
        `ALTER DATABASE ${quoteIdentifier(targets.developmentDatabase)} RENAME TO ${quoteIdentifier(row.candidate_name || "")}`
      );
    }
    await admin.query(
      `ALTER DATABASE ${quoteIdentifier(row.previous_name || "")} RENAME TO ${quoteIdentifier(targets.developmentDatabase)}`
    );
  } else if (previousCurrentName !== targets.developmentDatabase) {
    throw new DatabaseToolError(
      "OWNERSHIP_AMBIGUOUS",
      "The previous database OID cannot be reconciled."
    );
  }
  await grantRuntimeAdmission(admin, targets.developmentDatabase);
  const candidateAfterRollback = await nameForOid(admin, row.candidate_oid);
  if (candidateAfterRollback && candidateAfterRollback !== targets.developmentDatabase) {
    const active = await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname = $1 LIMIT 1", [
      candidateAfterRollback,
    ]);
    if (!active.rowCount)
      await admin.query(`DROP DATABASE ${quoteIdentifier(candidateAfterRollback)}`);
  }
  await ledgerState(admin, row.operation_id, "rolled_back");
}

export async function recoverLocalRefresh(operationId?: string): Promise<void> {
  await withHostLock("local-recover", async () => {
    const { shadow } = await localFiles();
    const admin = await connect(requireValue(shadow, "POSTGRES_ADMIN_URL"));
    try {
      const locked = await admin.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [`${targets.composeProject}:database-operation`]
      );
      if (!locked.rows[0]?.locked)
        throw new DatabaseToolError("RECOVERY_REQUIRED", "Another local operation is active.");
      await recoverOperation(admin, operationId);
    } finally {
      await admin
        .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
          `${targets.composeProject}:database-operation`,
        ])
        .catch(() => undefined);
      await admin.end();
    }
  });
}

export {
  createInactivityTimeout,
  fence,
  inventory,
  recoverOperation,
  repairSequences,
  streamDumpRestore,
};
