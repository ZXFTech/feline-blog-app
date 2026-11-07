import { Client } from "pg";
import dotenv from "dotenv";
import { privateConfigFile } from "./files";
import { canonicalJson, databaseFingerprint, RebuildError, sha256, tableNames } from "./contracts";
import {
  readSnapshot,
  serializeBackup,
  sourceConfig,
  verifyBackup,
  type BackupManifest,
} from "./backup";
import { cutoffSchema, type SourceCutoff } from "./maintenance-plan";
import {
  productionSourceFingerprint,
  type MaintenanceContext,
  type SqlClient,
} from "./maintenance-store";

async function relations(client: SqlClient) {
  const rows = (
    await client.query(
      "SELECT c.relname AS name,c.oid::int AS oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind IN('r','p') ORDER BY c.relname",
      [tableNames]
    )
  ).rows;
  if (rows.length !== tableNames.length) throw new RebuildError("SOURCE_CUTOFF_RELATIONS_REJECTED");
  return rows;
}
type LockProof = Pick<SourceCutoff, "backendPid" | "databaseOid" | "relationsDigest" | "lockedAt">;
export function assertBackupCutoff(
  manifest: BackupManifest,
  backupId: string,
  manifestSha256: string,
  proof: SourceCutoff
) {
  if (
    manifest.sourceFingerprint !== productionSourceFingerprint ||
    manifest.sourceFingerprint !== proof.sourceFingerprint ||
    manifest.contentDigest !== proof.sourceContentDigest ||
    backupId !== proof.backupId ||
    manifestSha256 !== proof.manifestSha256
  )
    throw new RebuildError("RESTORE_SOURCE_BINDING_REJECTED");
}
export async function assertSourceCutoff(
  context: Pick<MaintenanceContext, "client">,
  proof: LockProof
) {
  const actual = await relations(context.client);
  if (sha256(canonicalJson(actual)) !== proof.relationsDigest)
    throw new RebuildError("SOURCE_CUTOFF_BINDING_REJECTED");
  const row = (
    await context.client.query(
      `SELECT (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS database_oid,
    count(DISTINCT relation)::int AS locked FROM pg_locks WHERE pid=$1 AND locktype='relation' AND mode='ShareLock' AND granted AND database=$2::oid AND relation=ANY($3::oid[])`,
      [proof.backendPid, proof.databaseOid, actual.map((item) => item.oid)]
    )
  ).rows[0];
  const clock = (await context.client.query("SELECT clock_timestamp() AS now")).rows[0]?.now;
  if (
    row?.database_oid !== proof.databaseOid ||
    row.locked !== actual.length ||
    !(clock instanceof Date) ||
    clock.getTime() < Date.parse(proof.lockedAt) ||
    clock.getTime() - Date.parse(proof.lockedAt) > 300_000
  )
    throw new RebuildError("SOURCE_CUTOFF_LOST");
}
export async function holdSourceCutoff(lockFile: string, sourceFile: string) {
  const source = await sourceConfig(sourceFile),
    config = dotenv.parse(await privateConfigFile(lockFile));
  if (
    source.fingerprint !== productionSourceFingerprint ||
    Object.keys(config).some(
      (key) => !["POSTGRES_SOURCE_LOCK_URL", "POSTGRES_SSL_CA"].includes(key)
    ) ||
    !config.POSTGRES_SOURCE_LOCK_URL ||
    config.POSTGRES_SSL_CA !== source.ca
  )
    throw new RebuildError("SOURCE_CUTOFF_CONFIG_REJECTED");
  const url = new URL(config.POSTGRES_SOURCE_LOCK_URL);
  databaseFingerprint(config.POSTGRES_SOURCE_LOCK_URL);
  if (
    !url.hostname.endsWith(".pooler.supabase.com") ||
    Number(url.port || 5432) !== 5432 ||
    decodeURIComponent(url.username) !== "app_migrator.zjnjjzgxiltulkuhrjng" ||
    url.pathname !== "/postgres"
  )
    throw new RebuildError("SOURCE_CUTOFF_OWNER_REJECTED");
  const client = new Client({
    connectionString: config.POSTGRES_SOURCE_LOCK_URL,
    ssl: { ca: source.ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    application_name: "feline_sdk_restore_cutoff",
  });
  client.on("error", () => {});
  try {
    await client.connect();
    const identity = (
      await client.query(
        "SELECT current_user AS username,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls"
      )
    ).rows[0];
    if (identity?.username !== "app_migrator" || !identity.tls)
      throw new RebuildError("SOURCE_CUTOFF_OWNER_REJECTED");
    const ownership = (
      await client.query(
        "SELECT bool_and(c.relowner=current_user::regrole) AS owns_all FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
        [tableNames]
      )
    ).rows[0];
    if (!ownership?.owns_all) throw new RebuildError("SOURCE_CUTOFF_OWNER_REJECTED");
    await client.query(
      "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='240s'"
    );
    const actual = await relations(client);
    await client.query(
      `LOCK TABLE ${[...tableNames]
        .sort()
        .map((name) => `public."${name}"`)
        .join(",")} IN SHARE MODE`
    );
    const metadata = (
      await client.query(
        "SELECT pg_backend_pid() AS pid,(SELECT oid::int FROM pg_database WHERE datname=current_database()) AS database_oid,clock_timestamp() AS now"
      )
    ).rows[0];
    const lockProof: LockProof = {
      backendPid: metadata.pid,
      databaseOid: metadata.database_oid,
      relationsDigest: sha256(canonicalJson(actual)),
      lockedAt: metadata.now.toISOString(),
    };
    let lost = false;
    const assertHeld = async () => {
      if (lost) throw new RebuildError("SOURCE_CUTOFF_LOST");
      await assertSourceCutoff({ client }, lockProof);
    };
    const heartbeat = setInterval(() => {
      void assertHeld().catch(() => {
        lost = true;
        void client.query("ROLLBACK").catch(() => {});
      });
    }, 30_000);
    heartbeat.unref();
    return {
      sourceFingerprint: source.fingerprint,
      assertHeld,
      certifyBackup: async (backupId: string, manifestSha256: string): Promise<SourceCutoff> => {
        await assertHeld();
        const manifest = await verifyBackup(backupId, manifestSha256);
        if (manifest.sourceFingerprint !== source.fingerprint)
          throw new RebuildError("SOURCE_CUTOFF_BINDING_REJECTED");
        const reader = new Client({
          connectionString: source.connectionString,
          ssl: { ca: source.ca, rejectUnauthorized: true },
          connectionTimeoutMillis: 10000,
          query_timeout: 60000,
          application_name: "feline_sdk_cutoff_verification",
        });
        reader.on("error", () => {});
        try {
          await reader.connect();
          await reader.query(
            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL row_security=off; SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='60s'"
          );
          const current = serializeBackup(
            await readSnapshot((sql, values) => reader.query(sql, values)),
            backupId,
            source.fingerprint
          ).manifest;
          if (current.contentDigest !== manifest.contentDigest)
            throw new RebuildError("SOURCE_SNAPSHOT_CHANGED");
          await reader.query("COMMIT");
          await assertHeld();
          return cutoffSchema.parse({
            ...lockProof,
            sourceFingerprint: source.fingerprint,
            sourceContentDigest: current.contentDigest,
            backupId,
            manifestSha256,
          });
        } finally {
          await reader.query("ROLLBACK").catch(() => {});
          await reader.end().catch(() => {});
        }
      },
      release: async () => {
        clearInterval(heartbeat);
        try {
          await client.query("ROLLBACK");
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
    throw error;
  }
}
