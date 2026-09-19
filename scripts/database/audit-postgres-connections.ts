import { Pool, type PoolClient, type PoolConfig } from "pg";
import { createSecureContext } from "node:tls";
import { buildPostgresPoolConfig } from "../../src/db/postgres/config";

type RoleAudit = {
  ssl: boolean;
  canLogin: boolean;
  passwordValid: boolean;
  superuser: boolean;
  createDatabase: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  membershipCount: number;
  databaseConnect: boolean;
  schemaUsage: boolean;
  schemaCreate: boolean;
};

function requireUrl(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must use the postgresql:// or postgres:// protocol.`);
  }
  return url;
}

function connectionTarget(url: URL) {
  const tenant = url.hostname.includes("pooler.supabase.com")
    ? decodeURIComponent(url.username).split(".").slice(1).join(".")
    : url.hostname;
  return `${tenant}:${url.port || "5432"}${url.pathname}`;
}

function connectionMode(url: URL) {
  if (url.port === "6543") return "transaction-pooler";
  if (url.hostname.includes("pooler.supabase.com")) return "session-pooler";
  return "direct-or-custom";
}

function roleFromUrl(url: URL) {
  return decodeURIComponent(url.username).split(".")[0] ?? "";
}

function poolConfigFor(url: URL): PoolConfig {
  const sslCa = process.env.POSTGRES_SSL_CA?.replace(/\\n/g, "\n");
  const hasUrlSslOptions = ["sslmode", "sslcert", "sslkey", "sslrootcert"].some((name) =>
    url.searchParams.has(name)
  );
  return {
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    ...(sslCa && !hasUrlSslOptions ? { ssl: { ca: sslCa, rejectUnauthorized: true } } : {}),
  };
}

async function auditConnection(config: PoolConfig): Promise<RoleAudit> {
  const pool = new Pool({ ...config, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    const result = await client.query<Omit<RoleAudit, "ssl">>(`
      SELECT
        role.rolcanlogin AS "canLogin",
        (role.rolvaliduntil IS NULL OR role.rolvaliduntil > now()) AS "passwordValid",
        role.rolsuper AS "superuser",
        role.rolcreatedb AS "createDatabase",
        role.rolcreaterole AS "createRole",
        role.rolreplication AS "replication",
        role.rolbypassrls AS "bypassRls",
        (SELECT COUNT(*)::integer FROM pg_auth_members WHERE member = role.oid) AS "membershipCount",
        has_database_privilege(current_user, current_database(), 'CONNECT') AS "databaseConnect",
        has_schema_privilege(current_user, current_schema(), 'USAGE') AS "schemaUsage",
        has_schema_privilege(current_user, current_schema(), 'CREATE') AS "schemaCreate"
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    const audit = result.rows[0];
    if (!audit) throw new Error("Unable to inspect the connected PostgreSQL role.");
    return { ...audit, ssl: clientTlsActive(client) };
  } finally {
    client.release();
    await pool.end();
  }
}

function clientTlsActive(client: PoolClient): boolean {
  return (
    (
      client as unknown as {
        connection?: { stream?: { encrypted?: boolean } };
      }
    ).connection?.stream?.encrypted === true
  );
}

const runtimeUrl = requireUrl("POSTGRES_DATABASE_URL");
const migrationUrl = requireUrl("POSTGRES_MIGRATION_URL");
const shadowUrl = requireUrl("POSTGRES_SHADOW_DATABASE_URL");
const rolesAreDistinct = runtimeUrl.username !== migrationUrl.username;
const runtimeUsesExpectedRole = roleFromUrl(runtimeUrl) === "app_runtime";
const migrationUsesExpectedRole = roleFromUrl(migrationUrl) === "app_migrator";
const shadowUsesExpectedRole = roleFromUrl(shadowUrl) === "app_migrator";
const shadowIsDistinct = connectionTarget(migrationUrl) !== connectionTarget(shadowUrl);
const sslCa = process.env.POSTGRES_SSL_CA?.replace(/\\n/g, "\n");
let sslCaValid = false;
if (sslCa) {
  try {
    createSecureContext({ ca: sslCa });
    sslCaValid = true;
  } catch {
    sslCaValid = false;
  }
}

console.log(`PostgreSQL roles distinct: ${rolesAreDistinct}`);
console.log(`PostgreSQL runtime uses app_runtime: ${runtimeUsesExpectedRole}`);
console.log(`PostgreSQL migration uses app_migrator: ${migrationUsesExpectedRole}`);
console.log(`PostgreSQL shadow uses app_migrator: ${shadowUsesExpectedRole}`);
console.log(`PostgreSQL shadow target distinct: ${shadowIsDistinct}`);
console.log(`PostgreSQL runtime connection mode: ${connectionMode(runtimeUrl)}`);
console.log(`PostgreSQL migration connection mode: ${connectionMode(migrationUrl)}`);
console.log(`PostgreSQL shadow connection mode: ${connectionMode(shadowUrl)}`);
console.log(`PostgreSQL CA parses as a certificate: ${sslCaValid}`);

const connectionIssues: string[] = [];
async function tryAudit(label: string, config: PoolConfig) {
  try {
    return await auditConnection(config);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "NO_CODE";
    console.error(`PostgreSQL ${label} connection failed (${code}).`);
    connectionIssues.push(`The ${label} connection failed.`);
    return null;
  }
}

const runtime = await tryAudit("runtime", buildPostgresPoolConfig());
const migration = await tryAudit("migration", poolConfigFor(migrationUrl));
const shadow = await tryAudit("shadow", poolConfigFor(shadowUrl));

console.log(`PostgreSQL runtime TLS active: ${runtime?.ssl ?? false}`);
console.log(`PostgreSQL migration TLS active: ${migration?.ssl ?? false}`);
console.log(`PostgreSQL shadow TLS active: ${shadow?.ssl ?? false}`);
console.log(`PostgreSQL runtime database CONNECT: ${runtime?.databaseConnect ?? false}`);
console.log(`PostgreSQL runtime schema USAGE: ${runtime?.schemaUsage ?? false}`);
console.log(`PostgreSQL runtime schema CREATE: ${runtime?.schemaCreate ?? false}`);
console.log(`PostgreSQL migration schema CREATE: ${migration?.schemaCreate ?? false}`);
console.log(`PostgreSQL runtime role memberships: ${runtime?.membershipCount ?? -1}`);
console.log(`PostgreSQL migration role memberships: ${migration?.membershipCount ?? -1}`);

const issues = [
  ...connectionIssues,
  ...(!sslCaValid ? ["POSTGRES_SSL_CA is missing or is not a valid certificate."] : []),
  ...(!rolesAreDistinct ? ["Runtime and migration URLs use the same database role."] : []),
  ...(!runtimeUsesExpectedRole ? ["The runtime URL must use app_runtime."] : []),
  ...(!migrationUsesExpectedRole ? ["The migration URL must use app_migrator."] : []),
  ...(!shadowUsesExpectedRole ? ["The shadow URL must use app_migrator."] : []),
  ...(!shadowIsDistinct ? ["Migration and shadow URLs point to the same database target."] : []),
  ...(runtime && migration && shadow && (!runtime.ssl || !migration.ssl || !shadow.ssl)
    ? ["Every PostgreSQL connection must use TLS."]
    : []),
  ...(runtime && (!runtime.databaseConnect || !runtime.schemaUsage)
    ? ["The runtime role is missing CONNECT or schema USAGE."]
    : []),
  ...(runtime?.schemaCreate ? ["The runtime role must not have schema CREATE."] : []),
  ...(runtime &&
  (!runtime.canLogin ||
    !runtime.passwordValid ||
    runtime.superuser ||
    runtime.createDatabase ||
    runtime.createRole ||
    runtime.replication ||
    runtime.bypassRls ||
    runtime.membershipCount > 0)
    ? ["The runtime role has an elevated cluster privilege."]
    : []),
  ...(migration && !migration.schemaCreate ? ["The migration role is missing schema CREATE."] : []),
  ...(migration &&
  (!migration.canLogin ||
    !migration.passwordValid ||
    migration.superuser ||
    migration.createDatabase ||
    migration.createRole ||
    migration.replication ||
    migration.bypassRls ||
    migration.membershipCount > 0)
    ? ["The migration role has an unnecessary elevated cluster privilege."]
    : []),
];

if (issues.length) {
  for (const issue of issues) console.error(`PostgreSQL audit issue: ${issue}`);
  process.exitCode = 1;
} else {
  console.log("PostgreSQL connection and role audit passed.");
}
