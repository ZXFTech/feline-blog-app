import { Client } from "pg";
import dotenv from "dotenv";
import { privateConfigFile } from "./files";
import {
  databaseFingerprint,
  RebuildError,
  canonicalJson,
  sha256,
  type DataRow,
} from "./contracts";
import { selectConfiguration, serverConfiguration } from "../../src/lib/auth/sdk/configuration";
import type { MaintenancePlan, PlanBinding } from "./maintenance-plan";

export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: DataRow[]; rowCount?: number | null }>;
}
export const productionSourceFingerprint =
  "7c32f1c0d8429c126034e7c31d1539bff62473fefb40814011fff386ae1b4b91";
export interface MaintenanceContext {
  client: SqlClient;
  schema: "feline_sdk_prod";
  fingerprint: string;
  issuer: string;
  clientId: string;
  providerId: string;
}
export interface MaintenanceFiles {
  envFile: string;
  runtimeEnvFile: string;
  profilesFile: string;
}
export async function openMaintenance(
  files: MaintenanceFiles
): Promise<MaintenanceContext & { close(): Promise<void> }> {
  if (process.versions.node !== "22.21.1") throw new RebuildError("PINNED_NODE_REQUIRED");
  const values = dotenv.parse(await privateConfigFile(files.runtimeEnvFile));
  const selected = selectConfiguration(
    JSON.parse((await privateConfigFile(files.profilesFile)).toString("utf8")),
    values
  );
  const config = serverConfiguration(selected, values);
  const maintenance = dotenv.parse(await privateConfigFile(files.envFile));
  if (
    Object.keys(maintenance).some(
      (key) => !["POSTGRES_MIGRATION_URL", "POSTGRES_SSL_CA"].includes(key)
    ) ||
    !maintenance.POSTGRES_MIGRATION_URL ||
    !maintenance.POSTGRES_SSL_CA
  )
    throw new RebuildError("MAINTENANCE_CONFIG_REJECTED");
  const url = new URL(maintenance.POSTGRES_MIGRATION_URL),
    runtime = new URL(config.databaseUrl);
  if (
    selected.environment.runtimeEnvironment !== "production" ||
    selected.environment.targetEnvironment !== "production" ||
    config.databaseSchema !== "feline_sdk_prod" ||
    url.hostname !== runtime.hostname ||
    url.port !== runtime.port ||
    url.pathname !== runtime.pathname ||
    url.search ||
    url.hash ||
    !url.password ||
    decodeURIComponent(url.username) !== "blog_sdk_prod_migrator.zjnjjzgxiltulkuhrjng" ||
    decodeURIComponent(runtime.username) !== "blog_sdk_prod_runtime.zjnjjzgxiltulkuhrjng" ||
    maintenance.POSTGRES_SSL_CA.replace(/\\n/g, "\n") !== config.databaseCa
  )
    throw new RebuildError("MAINTENANCE_BINDING_REJECTED");
  const client = new Client({
    connectionString: maintenance.POSTGRES_MIGRATION_URL,
    ssl: { ca: config.databaseCa, rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
    application_name: "feline_sdk_maintenance",
  });
  client.on("error", () => {});
  try {
    await client.connect();
    const row = (
      await client.query(`SELECT current_user AS username,current_database() AS database,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
      r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
      (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='feline_sdk_prod') AS owner
      FROM pg_roles r WHERE rolname=current_user`)
    ).rows[0];
    if (
      !row ||
      row.username !== "blog_sdk_prod_migrator" ||
      row.database !== "postgres" ||
      row.owner !== row.username ||
      !row.tls ||
      row.rolsuper ||
      row.rolcreaterole ||
      row.rolcreatedb ||
      row.rolreplication ||
      row.rolbypassrls
    )
      throw new RebuildError("MAINTENANCE_IDENTITY_REJECTED");
    return {
      client,
      schema: "feline_sdk_prod",
      fingerprint: databaseFingerprint(maintenance.POSTGRES_MIGRATION_URL),
      issuer: selected.manifest.issuer,
      clientId: selected.manifest.clientId,
      providerId: selected.publicConfig.providerId,
      close: async () => {
        await client.end();
      },
    };
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}
export function object(context: MaintenanceContext, name: string): string {
  if (context.schema !== "feline_sdk_prod" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new RebuildError("MAINTENANCE_IDENTIFIER_REJECTED");
  return `"feline_sdk_prod"."${name}"`;
}
export interface InstallState extends DataRow {
  phase: "awaiting_root" | "awaiting_restore" | "ready";
  revision: number;
  targetGeneration: string;
  rootUserId: string | null;
  rootIssuer: string | null;
  rootSubjectDigest: string | null;
  bootstrapPlanDigest: string | null;
  restoreRunId: string | null;
  activationPlanDigest: string | null;
}
export async function readState(context: MaintenanceContext, lock = false): Promise<InstallState> {
  const row = (
    await context.client.query(
      `SELECT * FROM ${object(context, "AuthInstallState")} WHERE id='primary'${lock ? " FOR UPDATE" : ""}`
    )
  ).rows[0];
  if (
    !row ||
    !["awaiting_root", "awaiting_restore", "ready"].includes(String(row.phase)) ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 0 ||
    typeof row.targetGeneration !== "string"
  )
    throw new RebuildError("MAINTENANCE_INSTALLATION_REJECTED");
  return row as InstallState;
}
export function binding(context: MaintenanceContext, state: InstallState): PlanBinding {
  return {
    databaseSchema: context.schema,
    databaseFingerprint: context.fingerprint,
    targetGeneration: state.targetGeneration,
    runtimeEnvironment: "production",
    targetEnvironment: "production",
    issuer: context.issuer,
    clientId: context.clientId,
    providerId: context.providerId,
  };
}
export async function databaseNow(context: MaintenanceContext): Promise<Date> {
  const value = (await context.client.query("SELECT clock_timestamp() AS now")).rows[0]?.now;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new RebuildError("DATABASE_CLOCK_REJECTED");
  return value;
}
export async function readUser(
  context: MaintenanceContext,
  id: string,
  lock = false
): Promise<DataRow> {
  const row = (
    await context.client.query(
      `SELECT id,email::text,name,image,"emailVerified","createdAt","updatedAt","updateAt","authMode","authVersion",password IS NULL AS no_password,
    role::text,username,avatar,phone::text,work,"profileCompletedAt","profileEmailSnapshot"::text,"profileEmailConfirmedAt","businessCreatedAt","businessUpdatedAt"
    FROM ${object(context, "users")} WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id]
    )
  ).rows[0];
  if (!row) throw new RebuildError("MAINTENANCE_USER_NOT_FOUND");
  return row;
}
export function authFingerprint(row: DataRow): string {
  const keys = [
    "id",
    "email",
    "name",
    "image",
    "emailVerified",
    "createdAt",
    "updatedAt",
    "updateAt",
    "authMode",
    "authVersion",
    "no_password",
    "role",
    "profileCompletedAt",
    "profileEmailSnapshot",
    "profileEmailConfirmedAt",
  ];
  return sha256(canonicalJson(Object.fromEntries(keys.map((key) => [key, row[key]]))));
}
export async function transaction<T>(
  context: MaintenanceContext,
  authUserId: string,
  action: (state: InstallState, user: DataRow) => Promise<T>
): Promise<T> {
  await context.client.query("BEGIN");
  try {
    await context.client.query(
      "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SET LOCAL TIME ZONE 'UTC'"
    );
    const initial = await readState(context);
    await context.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      initial.targetGeneration,
    ]);
    const state = await readState(context, true);
    if (state.targetGeneration !== initial.targetGeneration)
      throw new RebuildError("MAINTENANCE_GENERATION_CHANGED");
    const user = await readUser(context, authUserId, true);
    const result = await action(state, user);
    await context.client.query("COMMIT");
    return result;
  } catch (error) {
    await context.client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
export async function identityFacts(
  context: MaintenanceContext,
  user: DataRow,
  expectedRole: "USER" | "ROOT"
) {
  if (
    user.role !== expectedRole ||
    user.authMode !== "sdk" ||
    !user.no_password ||
    user.emailVerified !== true ||
    typeof user.email !== "string" ||
    user.email.trim().toLowerCase() !== "zxf_tech@outlook.com" ||
    typeof user.profileEmailSnapshot !== "string" ||
    user.profileEmailSnapshot.trim().toLowerCase() !== user.email.trim().toLowerCase() ||
    !user.profileCompletedAt ||
    !user.profileEmailConfirmedAt ||
    !user.businessCreatedAt ||
    !user.businessUpdatedAt
  )
    throw new RebuildError("MAINTENANCE_USER_NOT_ELIGIBLE");
  const accounts = (
    await context.client.query(
      `SELECT "accountId" FROM ${object(context, "auth_accounts")} WHERE "userId"=$1 AND "providerId"=$2`,
      [user.id, context.providerId]
    )
  ).rows;
  const sessions = (
    await context.client.query(
      `SELECT count(*)::int AS count FROM ${object(context, "sessions")} WHERE "userId"=$1 AND "expiresAt">clock_timestamp()`,
      [user.id]
    )
  ).rows[0];
  if (
    accounts.length !== 1 ||
    typeof accounts[0].accountId !== "string" ||
    !accounts[0].accountId ||
    !Number(sessions?.count)
  )
    throw new RebuildError("MAINTENANCE_ACTIVE_IDENTITY_REQUIRED");
  return {
    subjectDigest: sha256(accounts[0].accountId),
    emailSnapshot: user.profileEmailSnapshot,
    authFingerprint: authFingerprint(user),
  };
}
export function assertRoot(
  state: InstallState,
  user: DataRow,
  context: MaintenanceContext,
  subjectDigest: string
) {
  if (
    !["awaiting_restore", "ready"].includes(state.phase) ||
    state.rootUserId !== user.id ||
    state.rootIssuer !== context.issuer ||
    state.rootSubjectDigest !== subjectDigest ||
    !state.bootstrapPlanDigest
  )
    throw new RebuildError("MAINTENANCE_ROOT_BINDING_REJECTED");
}
export async function lockForPlan(
  context: MaintenanceContext,
  plan: MaintenancePlan,
  action: (state: InstallState, user: DataRow) => Promise<DataRow>
) {
  return transaction(context, plan.authUserId, action);
}
