import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { assertPostgresBinding } from "@user-center/next-better-auth/config";
import { onlineTarget as target, onlineDirectory } from "./online-target";
import {
  readOnlineResource,
  assertOnlineResources,
  onlineAdminSql,
  verifyOnlineDatabase,
} from "./online-postgres";
import { privateConfigFile, privateDirectory } from "./files";

const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export function assertSnapshotEntries(expected: string[], actual: string[]) {
  const allowed = new Set([...expected, "migration_lock.toml"]);
  if (actual.some((name) => !allowed.has(name))) throw Error("ONLINE_LOCAL_SNAPSHOT_REJECTED");
}
export async function migrateOnlineDatabase() {
  if (process.versions.node !== "22.21.1") throw Error("WRONG_NODE_VERSION");
  const directory = path.join(onlineDirectory(), "postgres"),
    execution = path.join(directory, "migration-execution");
  const resource = await readOnlineResource();
  assertOnlineResources(resource);
  if (resource.phase !== "initialized" && resource.phase !== "schema-ready")
    throw Error("ONLINE_LOCAL_MIGRATION_PHASE_REJECTED");
  if (
    !resource.systemIdentifier ||
    onlineAdminSql("SELECT system_identifier FROM pg_control_system();\n", target.database) !==
      resource.systemIdentifier
  )
    throw Error("ONLINE_LOCAL_CLUSTER_MISMATCH");
  const values = dotenv.parse(
    await privateConfigFile(path.join(onlineDirectory(), ".env.maintenance.local"))
  );
  const binding = {
    hostname: "127.0.0.1",
    port: target.databasePort,
    database: target.database,
    username: target.maintenanceRole,
    urlEnv: "POSTGRES_MIGRATION_URL",
  };
  assertPostgresBinding(values.POSTGRES_MIGRATION_URL, binding);
  const caFile = path.join(directory, "tls/rootCA.pem");
  if (digest(values.POSTGRES_SSL_CA ?? "") !== digest(fs.readFileSync(caFile)))
    throw Error("ONLINE_LOCAL_CA_MISMATCH");
  const client = new pg.Client({
    connectionString: values.POSTGRES_MIGRATION_URL,
    ssl: { ca: values.POSTGRES_SSL_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    database: target.database,
    port: target.databasePort,
    onlineDatabaseAccessed: false,
    backupExecuted: false,
    restoreExecuted: false,
    rootInitialized: false,
  };
  await privateDirectory(execution);
  try {
    await client.connect();
    const identity = (
      await client.query(
        "SELECT current_database() AS database,current_user AS username,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner"
      )
    ).rows[0];
    if (
      identity.database !== target.database ||
      identity.username !== target.maintenanceRole ||
      identity.owner !== target.maintenanceRole ||
      !identity.tls
    )
      throw Error("ONLINE_LOCAL_SQL_IDENTITY_REJECTED");
    const canonical = path.resolve("prisma/postgres/migrations"),
      snapshot = path.join(execution, "migrations");
    await privateDirectory(snapshot);
    const directories = fs
      .readdirSync(canonical, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const names = directories.filter((name) =>
      fs.existsSync(path.join(canonical, name, "migration.sql"))
    );
    const placeholders = directories.filter((name) => !names.includes(name));
    if (
      names.length !== 8 ||
      JSON.stringify(placeholders) !== '["20261026000000_center_only_environment"]'
    )
      throw Error("ONLINE_LOCAL_MIGRATION_CHAIN_CHANGED");
    assertSnapshotEntries(names, fs.readdirSync(snapshot));
    const migrations: { name: string; sha256: string }[] = [];
    for (const name of names) {
      if (fs.lstatSync(path.join(canonical, name, "migration.sql")).isSymbolicLink())
        throw Error("ONLINE_LOCAL_MIGRATION_SOURCE_REJECTED");
      const source = fs.readFileSync(path.join(canonical, name, "migration.sql"));
      await privateDirectory(path.join(snapshot, name));
      fs.writeFileSync(path.join(snapshot, name, "migration.sql"), source);
      migrations.push({ name, sha256: digest(source) });
    }
    fs.copyFileSync(
      path.join(canonical, "migration_lock.toml"),
      path.join(snapshot, "migration_lock.toml")
    );
    assertSnapshotEntries(names, fs.readdirSync(snapshot));
    if (
      migrations.some(
        (item) =>
          digest(fs.readFileSync(path.join(snapshot, item.name, "migration.sql"))) !== item.sha256
      )
    )
      throw Error("ONLINE_LOCAL_SNAPSHOT_REJECTED");
    const config = path.join(execution, "prisma.config.ts");
    fs.writeFileSync(
      config,
      'import {defineConfig} from "prisma/config";\nexport default defineConfig({schema:' +
        JSON.stringify(path.resolve("prisma/postgres/schema.prisma")) +
        ",migrations:{path:" +
        JSON.stringify(snapshot) +
        "},datasource:{url:process.env.POSTGRES_MIGRATION_URL}});\n"
    );
    const cliUrl = new URL(values.POSTGRES_MIGRATION_URL);
    cliUrl.searchParams.set("sslmode", "require");
    cliUrl.searchParams.set("sslaccept", "strict");
    cliUrl.searchParams.set("sslcert", caFile.replaceAll("\\", "/"));
    const env: NodeJS.ProcessEnv = { ...process.env, POSTGRES_MIGRATION_URL: cliUrl.toString() };
    for (const name of Object.keys(env))
      if (
        /^PG/.test(name) ||
        ["DATABASE_URL", "DIRECT_URL", "POSTGRES_SHADOW_DATABASE_URL"].includes(name)
      )
        delete env[name];
    const cli = (command: string[], label: string) => {
      const result = spawnSync(
        process.execPath,
        [path.resolve("node_modules/prisma/build/index.js"), ...command, "--config", config],
        { env, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 4 * 1048576 }
      );
      fs.writeFileSync(
        path.join(execution, label + ".log"),
        (result.stdout ?? "") + (result.stderr ?? ""),
        { mode: 0o600 }
      );
      return {
        exit: result.status,
        codes: [
          ...new Set(((result.stdout ?? "") + (result.stderr ?? "")).match(/\bP\d{4}\b/g) ?? []),
        ],
      };
    };
    if (resource.phase === "initialized") {
      const count = (
        await client.query(
          "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'"
        )
      ).rows[0].count;
      if (count !== 0) throw Error("ONLINE_LOCAL_TARGET_NOT_EMPTY");
      report.statusBefore = cli(["migrate", "status"], "status-before");
      const deployed = cli(["migrate", "deploy"], "deploy");
      report.deploy = deployed;
      if (deployed.exit !== 0 || deployed.codes.length)
        throw Error("ONLINE_LOCAL_MIGRATION_FAILED");
      report.schemaApplied = true;
      const acl = fs.readFileSync("docs/database/plans/0019-sdk-local-online-runtime.sql", "utf8");
      report.aclSha256 = digest(acl);
      await client.query(acl);
      report.runtimeAclInstalled = true;
    }
    const status = cli(["migrate", "status"], "status-after");
    report.statusAfter = status;
    if (status.exit !== 0 || status.codes.length)
      throw Error("ONLINE_LOCAL_MIGRATION_STATUS_FAILED");
    const history = (
      await client.query(
        "SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name"
      )
    ).rows;
    if (
      history.length !== migrations.length ||
      history.some(
        (row, index) =>
          !row.finished ||
          row.rolled_back ||
          row.migration_name !== migrations[index].name ||
          row.checksum !== migrations[index].sha256
      )
    )
      throw Error("ONLINE_LOCAL_HISTORY_MISMATCH");
    const state = (
      await client.query(
        'SELECT phase,revision,"rootUserId" IS NULL AS no_root,"restoreRunId" IS NULL AS no_restore,"activatedAt" IS NULL AS not_activated FROM public."AuthInstallState" WHERE id=\'primary\''
      )
    ).rows[0];
    if (
      state?.phase !== "awaiting_root" ||
      state.revision !== 0 ||
      !state.no_root ||
      !state.no_restore ||
      !state.not_activated
    )
      throw Error("ONLINE_LOCAL_INSTALLATION_NOT_INITIAL");
    const users = (await client.query("SELECT count(*)::int AS count FROM public.users")).rows[0]
      .count;
    if (users !== 0) throw Error("ONLINE_LOCAL_TARGET_ALREADY_HAS_USERS");
    report.installation = state;
    report.userCount = users;
    report.migrations = migrations;
    report.cleanup = (
      await client.query(
        "SELECT cron_job_id IS NULL AS no_job,activated_at IS NULL AS inactive,last_result,history_mode FROM auth_ops.cleanup_state"
      )
    ).rows[0];
    report.runtimeChecks = await verifyRuntime();
    await verifyOnlineDatabase();
    resource.phase = "schema-ready";
    fs.writeFileSync(
      path.join(directory, "resource.json"),
      JSON.stringify(resource, null, 2) + "\n"
    );
    assertOnlineResources(resource);
    report.status = "PASS";
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(execution, "result.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } catch (error) {
    report.failure =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "ONLINE_LOCAL_MIGRATION_FAILED";
    fs.writeFileSync(path.join(execution, "failure.json"), JSON.stringify(report, null, 2) + "\n");
    throw Error(String(report.failure));
  } finally {
    await client.end().catch(() => {});
  }
}
async function verifyRuntime() {
  const values = dotenv.parse(
    await privateConfigFile(path.join(onlineDirectory(), ".env.blog.local"))
  );
  assertPostgresBinding(values[target.databaseUrlEnv], {
    hostname: "127.0.0.1",
    port: target.databasePort,
    database: target.database,
    username: target.runtimeRole,
    urlEnv: target.databaseUrlEnv,
  });
  const client = new pg.Client({
    connectionString: values[target.databaseUrlEnv],
    ssl: { ca: values.PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  const checks: string[] = [];
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT public.feline_sdk_lock_installation()");
    const id = "runtime-proof-" + randomUUID();
    await client.query(
      'INSERT INTO public.users(id,email,"updatedAt","updateAt") VALUES($1,$2,now(),now())',
      [id, id + "@example.invalid"]
    );
    await client.query("SELECT id FROM public.users WHERE id=$1 FOR UPDATE", [id]);
    await client.query(
      'INSERT INTO public.auth_accounts(id,"providerId","accountId","userId","updatedAt") VALUES($1,\'proof\',\'subject\',$2,now())',
      [id, id]
    );
    await client.query(
      'INSERT INTO public.sessions(id,token,"userId","expiresAt","updatedAt") VALUES($1,$2,$1,now()+interval \'1 minute\',now())',
      [id, randomUUID()]
    );
    await client.query("DELETE FROM public.sessions WHERE id=$1", [id]);
    checks.push(
      "installation-share-lock",
      "user-insert-and-lock",
      "account-insert",
      "session-insert-delete"
    );
    for (const [name, sql] of [
      ["role-update-denied", "UPDATE public.users SET role='ROOT'"],
      ["installation-write-denied", "UPDATE public.\"AuthInstallState\" SET phase='ready'"],
      ["cleanup-denied", "SELECT auth_ops.cleanup_tick()"],
      ["legacy-session-denied", "SELECT * FROM public.legacy_sessions"],
    ]) {
      await client.query("SAVEPOINT denied");
      let rejected = false;
      try {
        await client.query(sql);
      } catch (error) {
        rejected = (error as { code?: string }).code === "42501";
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT denied");
      }
      if (!rejected) throw Error("ONLINE_LOCAL_ACL_NOT_ENFORCED");
      checks.push(name);
    }
    await client.query("ROLLBACK");
    if ((await client.query("SELECT count(*)::int AS count FROM public.users")).rows[0].count !== 0)
      throw Error("ONLINE_LOCAL_FIXTURE_NOT_ROLLED_BACK");
    checks.push("all-fixtures-rolled-back");
    return checks;
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}
