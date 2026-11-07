import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { assertSafeMigrationSql, reconcileMigrationHistory } from "./staging-core";

// Dedicated CI input only. Never load dotenv, runtime or maintenance configuration.
export function ciReplayTarget(env: Readonly<Record<string, string | undefined>>): URL {
  let url: URL;
  try {
    url = new URL(env.CI_SDK_DATABASE_URL ?? "");
  } catch {
    throw Error("CI_REPLAY_TARGET_REJECTED");
  }
  if (
    env.CI !== "true" ||
    env.CI_SDK_REPLAY !== "1" ||
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5432" ||
    url.pathname !== "/postgres" ||
    url.username !== "postgres" ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("CI_REPLAY_TARGET_REJECTED");
  return url;
}

async function connect(url: URL) {
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
    query_timeout: 120000,
  });
  await client.connect();
  return client;
}

export async function replaySdkProduction() {
  const adminUrl = ciReplayTarget(process.env);
  const root = "prisma/postgres/sdk-production/migrations";
  const files = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!entry.isDirectory()) continue;
    const file = `${root}/${entry.name}/migration.sql`;
    const sql = await readFile(file, "utf8");
    assertSafeMigrationSql(sql, entry.name, file);
    files.push({
      name: entry.name,
      sql,
      checksum: createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex"),
    });
  }
  if (!files.length) throw Error("CI_REPLAY_HISTORY_MISSING");
  const admin = await connect(adminUrl);
  try {
    const fresh = (
      await admin.query(`SELECT current_database()='postgres' AND current_user='postgres'
      AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='feline_sdk_prod')
      AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%')
      AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
      AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
      AND NOT EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
      AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql')
      AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname<>'postgres' AND rolname NOT LIKE 'pg_%')
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN ('postgres','template0','template1','feline_ci_verify')) AS fresh`)
    ).rows[0]?.fresh;
    if (!fresh) throw Error("CI_REPLAY_REQUIRES_FRESH_DATABASE");
    await admin.query(`BEGIN;
      CREATE EXTENSION citext; CREATE EXTENSION pg_trgm;
      CREATE ROLE blog_sdk_prod_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE blog_sdk_prod_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA feline_sdk_prod AUTHORIZATION blog_sdk_prod_migrator;
      COMMIT;`);
  } finally {
    await admin.end();
  }

  const ownerUrl = new URL(adminUrl);
  ownerUrl.username = "blog_sdk_prod_migrator";
  ownerUrl.searchParams.set("schema", "feline_sdk_prod");
  const child = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--config",
      "./prisma.sdk-production.config.mjs",
    ],
    {
      env: { ...process.env, SDK_PRODUCTION_MIGRATION_URL: ownerUrl.toString() },
      encoding: "utf8",
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 1024 * 1024,
    }
  );
  if (child.status !== 0) throw Error("CI_NAMESPACE_MIGRATION_FAILED");
  const owner = await connect(ownerUrl);
  try {
    const history = (
      await owner.query(
        `SELECT migration_name,checksum,finished_at,rolled_back_at FROM feline_sdk_prod._prisma_migrations ORDER BY started_at,id`
      )
    ).rows;
    const result = reconcileMigrationHistory(
      files,
      history.map((row) => ({
        migrationName: row.migration_name,
        checksum: row.checksum,
        finishedAt: row.finished_at,
        rolledBackAt: row.rolled_back_at,
      }))
    );
    if (result.pending.length || result.applied.length !== files.length)
      throw Error("CI_NAMESPACE_HISTORY_MISMATCH");
    const state = (
      await owner.query(
        `SELECT phase,revision,(SELECT count(*)::int FROM feline_sdk_prod.users) AS users FROM feline_sdk_prod."AuthInstallState" WHERE id='primary'`
      )
    ).rows[0];
    const authority = (
      await owner.query(`SELECT
      has_table_privilege('blog_sdk_prod_runtime','feline_sdk_prod."AuthInstallState"','SELECT') AS can_read_state,
      has_table_privilege('blog_sdk_prod_runtime','feline_sdk_prod."AuthInstallState"','UPDATE') AS can_update_state,
      has_column_privilege('blog_sdk_prod_runtime','feline_sdk_prod.users','role','UPDATE') AS can_update_role,
      EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='feline_sdk_prod.auth_accounts'::regclass AND c.relname='auth_accounts_providerId_accountId_key' AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL) AS account_unique`)
    ).rows[0];
    if (
      state?.phase !== "awaiting_root" ||
      state.revision !== 0 ||
      state.users !== 0 ||
      !authority?.can_read_state ||
      authority.can_update_state ||
      authority.can_update_role ||
      !authority.account_unique
    )
      throw Error("CI_NAMESPACE_CONTRACT_FAILED");
    return {
      code: "CI_NAMESPACE_REPLAY_PASSED",
      migrations: files.length,
      phase: state.phase,
      users: 0,
      authorityWritesDenied: true,
    };
  } finally {
    await owner.end();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await replaySdkProduction()));
  } catch (error) {
    console.error(
      JSON.stringify({
        code:
          error instanceof Error && /^CI_[A-Z_]+$/.test(error.message)
            ? error.message
            : "CI_NAMESPACE_REPLAY_FAILED",
      })
    );
    process.exitCode = 1;
  }
}
