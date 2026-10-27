import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { Pool } from "pg";

// This release intentionally supplies an isolated installer only. Hosted activation remains a separate gate.
export function isolatedTarget(env, service) {
  const raw = env.MIGRATION_DATABASE_URL;
  if (env.APP_ENV !== "development" || !raw || !["center","blog"].includes(service)) throw Error("ISOLATED_TARGET_REQUIRED");
  const url = new URL(raw);
  if (!["postgres:","postgresql:"].includes(url.protocol) || !["127.0.0.1","localhost"].includes(url.hostname) ||
      url.port !== (service === "center" ? "54354" : "54355") || url.pathname !== "/runtime_enhancement_" + service ||
      !url.username || !url.password || url.search || url.hash) throw Error("ISOLATED_TARGET_REQUIRED");
  // The local image supplies PG/pg_cron binaries, not a managed Supabase control plane.
  return { connectionString: raw, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 10000, options: "-c session_preload_libraries=" };
}
export async function installOps(pool, runtime, permissions, side) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtime ?? "")) throw Error("RUNTIME_ROLE_INVALID");
  const connection=pool.options.connectionString;
  const service=new URL(connection).pathname.slice(1).replace('runtime_enhancement_','');
  isolatedTarget({APP_ENV:'development',MIGRATION_DATABASE_URL:connection},service);
  const state=(await pool.query("SELECT history_mode FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'")).rows[0];
  if(!state||!['disabled','isolated-direct-v1'].includes(state.history_mode))throw Error('ISOLATED_MODE_CONFLICT');
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_cron");
  const sql = permissions.replace(/COMMIT;\s*$/, () => side + "\n" + readFileSync(new URL("../../ops/auth-cleanup/isolated-status.sql",import.meta.url),"utf8") + "\nCOMMIT;").replaceAll("__RUNTIME__", runtime);
  await pool.query(sql);
  const { rows: [row] } = await pool.query("SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='auth_ops_owner'");
  if (!row || row.rolsuper || row.rolbypassrls || row.rolcanlogin) throw Error("OPS_ROLE_INVALID");
}
export async function activateOps(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [settings] } = await client.query("SELECT current_setting('cron.use_background_workers',true) AS workers,current_setting('cron.log_run',true) AS logs");
    if (settings.workers !== "on" || settings.logs !== "on") throw Error("CRON_CAPABILITY_UNPROVEN");
    const { rows: [state] } = await client.query("SELECT * FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup' FOR UPDATE");
    if (!state || state.history_mode!=="isolated-direct-v1") throw Error("OPS_SCHEMA_MISSING");
    const existing = await client.query("SELECT jobid,username,command,database,active,schedule FROM cron.job WHERE jobname='auth-cleanup'");
    if (existing.rows.some(row => row.username !== "auth_cleanup_scheduler" || row.command !== "SELECT auth_ops.cleanup_tick()" || row.schedule !== "* * * * *" || !row.active)) throw Error("CRON_IDENTITY_CONFLICT");
    if (existing.rowCount > 1 || (state.cron_job_id !== null && String(existing.rows[0]?.jobid) !== String(state.cron_job_id))) throw Error("CRON_IDENTITY_CONFLICT");
    let jobId = existing.rows[0]?.jobid;
    if (!jobId) {
      const password = randomBytes(48).toString("base64");
      await client.query("ALTER ROLE auth_cleanup_scheduler LOGIN PASSWORD '" + password + "'");
      await client.query("GRANT USAGE ON SCHEMA cron TO auth_cleanup_scheduler");
      await client.query("GRANT EXECUTE ON FUNCTION cron.schedule(text,text,text) TO auth_cleanup_scheduler");
      await client.query("SET LOCAL ROLE auth_cleanup_scheduler");
      const scheduled = await client.query("SELECT cron.schedule('auth-cleanup','* * * * *','SELECT auth_ops.cleanup_tick()') AS id");
      jobId = scheduled.rows[0].id;
      await client.query("RESET ROLE");
      await client.query("REVOKE EXECUTE ON FUNCTION cron.schedule(text,text,text) FROM auth_cleanup_scheduler");
    }
    const { rows: [job] } = await client.query("SELECT jobid,username,command,database,active,schedule FROM cron.job WHERE jobid=$1", [jobId]);
    const { rows: [db] } = await client.query("SELECT current_database() AS name");
    if (!job || job.username !== "auth_cleanup_scheduler" || job.command !== "SELECT auth_ops.cleanup_tick()" || job.database !== db.name || job.schedule !== "* * * * *" || !job.active) throw Error("CRON_IDENTITY_INVALID");
    await client.query("UPDATE auth_ops.cleanup_state SET cron_job_id=$1,activated_at=COALESCE(activated_at,clock_timestamp()),next_due_at=date_trunc('minute',clock_timestamp()) WHERE job_name='auth-cleanup'", [jobId]);
    await client.query("COMMIT");
    return { cronJobId: String(jobId) };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
async function main() {
  const service = process.argv[3];
  if (!process.argv.includes("--isolated")) throw Error("ISOLATED_TARGET_REQUIRED");
  const config = isolatedTarget(process.env, service), pool = new Pool(config);
  pool.on("error", () => {});
  try {
    const base = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    if (process.argv[2] === "install") {
      await installOps(pool, process.env.DATABASE_RUNTIME_ROLE, readFileSync(resolve(base,"ops/auth-cleanup/permissions.sql"),"utf8"), readFileSync(resolve(base,"ops/auth-cleanup/permissions-" + service + ".sql"),"utf8"));
      console.log("ISOLATED_OPS_INSTALLED");
    } else if (process.argv[2] === "activate") {
      const result = await activateOps(pool);
      console.log(JSON.stringify({ code: "ISOLATED_CRON_ACTIVATED", ...result }));
    } else throw Error("UNKNOWN_COMMAND");
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.log("ISOLATED_OPS_COMMAND_FAILED"); process.exitCode=1; });
