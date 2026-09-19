import { createSecureContext } from "node:tls";
import { basename } from "node:path";
import { Pool, type PoolClient, type PoolConfig } from "pg";

const RUNTIME_ROLE = "app_runtime";
const MIGRATOR_ROLE = "app_migrator";
const ALLOWED_ENVIRONMENTS = new Set(["local", "development", "test", "preview"]);

type RoleName = typeof RUNTIME_ROLE | typeof MIGRATOR_ROLE;

type Configuration = {
  mainAdminUrl: URL;
  shadowAdminUrl: URL;
  runtimeUrl: URL;
  migrationUrl: URL;
  shadowUrl: URL;
  runtimePassword: string;
  migratorPassword: string;
  shadowUrlNeedsMigratorRole: boolean;
};

function requireValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requirePostgresUrl(name: string, allowTransactionPooler = false): URL {
  const url = new URL(requireValue(name));
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must use the postgresql:// or postgres:// protocol.`);
  }
  if (!allowTransactionPooler && url.port === "6543") {
    throw new Error(`${name} must not use a transaction pooler.`);
  }
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "disable" || sslMode === "no-verify") {
    throw new Error(`${name} must not disable TLS verification.`);
  }
  return url;
}

export function roleFromUrl(url: URL): string {
  return decodeURIComponent(url.username).split(".")[0] ?? "";
}

export function connectionTarget(url: URL): string {
  const tenant = url.hostname.includes("pooler.supabase.com")
    ? decodeURIComponent(url.username).split(".").slice(1).join(".")
    : url.hostname;
  return `${tenant}${url.pathname}`;
}

function assertRole(name: string, url: URL, expectedRole: RoleName | "postgres") {
  if (roleFromUrl(url) !== expectedRole) {
    throw new Error(`${name} must authenticate as ${expectedRole}.`);
  }
}

export function assertStrongPassword(name: string, password: string, otherPassword?: string) {
  if (password.length < 24) throw new Error(`${name} must contain at least 24 characters.`);
  if (/\s/.test(password)) throw new Error(`${name} must not contain whitespace.`);
  if (password === RUNTIME_ROLE || password === MIGRATOR_ROLE) {
    throw new Error(`${name} must not equal a database role name.`);
  }
  if (otherPassword && password === otherPassword) {
    throw new Error("Runtime and migrator passwords must be different.");
  }
}

export function validateConfiguration(): Configuration {
  const environment = requireValue("POSTGRES_ENVIRONMENT").toLowerCase();
  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error("Role configuration is allowed only for local, development, test, or preview.");
  }
  if (process.env.POSTGRES_CONFIGURE_ROLES !== "true") {
    throw new Error("POSTGRES_CONFIGURE_ROLES=true is required for this controlled operation.");
  }

  const runtimeUrl = requirePostgresUrl("POSTGRES_DATABASE_URL", true);
  const migrationUrl = requirePostgresUrl("POSTGRES_MIGRATION_URL");
  const shadowUrl = requirePostgresUrl("POSTGRES_SHADOW_DATABASE_URL");
  const mainAdminUrl = requirePostgresUrl("POSTGRES_ADMIN_URL");
  const shadowAdminUrl = requirePostgresUrl("POSTGRES_SHADOW_ADMIN_URL");
  assertRole("POSTGRES_DATABASE_URL", runtimeUrl, RUNTIME_ROLE);
  assertRole("POSTGRES_MIGRATION_URL", migrationUrl, MIGRATOR_ROLE);
  const shadowRole = roleFromUrl(shadowUrl);
  if (shadowRole !== MIGRATOR_ROLE && shadowRole !== "postgres") {
    throw new Error(
      `POSTGRES_SHADOW_DATABASE_URL must authenticate as ${MIGRATOR_ROLE}, or postgres only during initial role setup.`
    );
  }
  assertRole("POSTGRES_ADMIN_URL", mainAdminUrl, "postgres");
  assertRole("POSTGRES_SHADOW_ADMIN_URL", shadowAdminUrl, "postgres");

  const mainTarget = connectionTarget(migrationUrl);
  const shadowTarget = connectionTarget(shadowUrl);
  if (
    connectionTarget(runtimeUrl) !== mainTarget ||
    connectionTarget(mainAdminUrl) !== mainTarget
  ) {
    throw new Error("Runtime, migration, and main admin URLs must target the same database.");
  }
  if (connectionTarget(shadowAdminUrl) !== shadowTarget) {
    throw new Error("Shadow and shadow admin URLs must target the same database.");
  }
  if (mainTarget === shadowTarget) {
    throw new Error("The main and shadow databases must be different targets.");
  }

  const runtimePassword = requireValue("POSTGRES_RUNTIME_PASSWORD");
  const migratorPassword = requireValue("POSTGRES_MIGRATOR_PASSWORD");
  assertStrongPassword("POSTGRES_RUNTIME_PASSWORD", runtimePassword);
  assertStrongPassword("POSTGRES_MIGRATOR_PASSWORD", migratorPassword, runtimePassword);

  const sslCa = requireValue("POSTGRES_SSL_CA").replace(/\\n/g, "\n");
  createSecureContext({ ca: sslCa });

  return {
    mainAdminUrl,
    shadowAdminUrl,
    runtimeUrl,
    migrationUrl,
    shadowUrl,
    runtimePassword,
    migratorPassword,
    shadowUrlNeedsMigratorRole: shadowRole !== MIGRATOR_ROLE,
  };
}

function poolConfig(url: URL): PoolConfig {
  const sslCa = requireValue("POSTGRES_SSL_CA").replace(/\\n/g, "\n");
  const hasUrlSslOptions = ["sslmode", "sslcert", "sslkey", "sslrootcert"].some((name) =>
    url.searchParams.has(name)
  );
  if (hasUrlSslOptions) {
    throw new Error("Admin URLs must not combine URL SSL options with POSTGRES_SSL_CA.");
  }
  return {
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    ssl: { ca: sslCa, rejectUnauthorized: true },
  };
}

async function alterRolePassword(client: PoolClient, role: RoleName, password: string) {
  const formatted = await client.query<{ sql: string }>(
    `SELECT format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L VALID UNTIL %L',
      $1::text,
      $2::text,
      'infinity'
    ) AS sql`,
    [role, password]
  );
  await client.query(formatted.rows[0]!.sql);
}

async function assertRolesSafe(client: PoolClient, roles: RoleName[]) {
  const result = await client.query<{
    roleName: string;
    superuser: boolean;
    createDatabase: boolean;
    createRole: boolean;
    replication: boolean;
    bypassRls: boolean;
    membershipCount: number;
  }>(
    `SELECT
       role.rolname AS "roleName",
       role.rolsuper AS "superuser",
       role.rolcreatedb AS "createDatabase",
       role.rolcreaterole AS "createRole",
       role.rolreplication AS "replication",
       role.rolbypassrls AS "bypassRls",
       (SELECT COUNT(*)::integer FROM pg_auth_members WHERE member = role.oid) AS "membershipCount"
     FROM pg_roles AS role
     WHERE role.rolname = ANY($1::text[])`,
    [roles]
  );
  if (result.rowCount !== roles.length) {
    throw new Error("One or more required application roles do not exist on the target project.");
  }
  const unsafe = result.rows.some(
    (role) =>
      role.superuser ||
      role.createDatabase ||
      role.createRole ||
      role.replication ||
      role.bypassRls ||
      role.membershipCount > 0
  );
  if (unsafe) {
    throw new Error("One or more application roles have elevated attributes or role memberships.");
  }
}

async function grantDatabaseConnect(client: PoolClient, roles: RoleName[]) {
  for (const role of roles) {
    const formatted = await client.query<{ sql: string }>(
      "SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), $1::text) AS sql",
      [role]
    );
    await client.query(formatted.rows[0]!.sql);
  }
}

async function configureMain(config: Configuration) {
  const pool = new Pool(poolConfig(config.mainAdminUrl));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL password_encryption = 'scram-sha-256'");
    await assertRolesSafe(client, [RUNTIME_ROLE, MIGRATOR_ROLE]);
    await alterRolePassword(client, RUNTIME_ROLE, config.runtimePassword);
    await alterRolePassword(client, MIGRATOR_ROLE, config.migratorPassword);
    await grantDatabaseConnect(client, [RUNTIME_ROLE, MIGRATOR_ROLE]);
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${RUNTIME_ROLE}`);
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${MIGRATOR_ROLE}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`);
    await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATOR_ROLE}`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function configureMigratorDefaults(config: Configuration) {
  const migrationUrl = new URL(config.migrationUrl);
  migrationUrl.password = config.migratorPassword;
  const pool = new Pool(poolConfig(migrationUrl));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RUNTIME_ROLE}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO ${RUNTIME_ROLE}`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function configureShadow(config: Configuration) {
  const pool = new Pool(poolConfig(config.shadowAdminUrl));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL password_encryption = 'scram-sha-256'");
    await assertRolesSafe(client, [MIGRATOR_ROLE]);
    await alterRolePassword(client, MIGRATOR_ROLE, config.migratorPassword);
    await grantDatabaseConnect(client, [MIGRATOR_ROLE]);
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${MIGRATOR_ROLE}`);
    await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATOR_ROLE}`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function urlWithCredentials(url: URL, role: RoleName, password: string): URL {
  const result = new URL(url);
  const usernameParts = decodeURIComponent(result.username).split(".");
  usernameParts[0] = role;
  result.username = usernameParts.join(".");
  result.password = password;
  return result;
}

async function verifyRoleConnection(
  label: string,
  url: URL,
  expectedRole: RoleName,
  expectedSchemaCreate: boolean
) {
  const pool = new Pool(poolConfig(url));
  const client = await pool.connect();
  try {
    const result = await client.query<{
      roleName: string;
      schemaUsage: boolean;
      schemaCreate: boolean;
    }>(`
      SELECT
        current_user AS "roleName",
        has_schema_privilege(current_user, 'public', 'USAGE') AS "schemaUsage",
        has_schema_privilege(current_user, 'public', 'CREATE') AS "schemaCreate"
    `);
    const role = result.rows[0];
    const tlsActive =
      (
        client as unknown as {
          connection?: { stream?: { encrypted?: boolean } };
        }
      ).connection?.stream?.encrypted === true;
    if (
      !role ||
      role.roleName !== expectedRole ||
      !tlsActive ||
      !role.schemaUsage ||
      role.schemaCreate !== expectedSchemaCreate
    ) {
      throw new Error(
        `${label} role verification failed: role=${role?.roleName === expectedRole}, TLS=${tlsActive}, USAGE=${role?.schemaUsage ?? false}, CREATE=${role?.schemaCreate ?? false}.`
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function verifyConfiguredRoles(config: Configuration) {
  await verifyRoleConnection(
    "runtime",
    urlWithCredentials(config.runtimeUrl, RUNTIME_ROLE, config.runtimePassword),
    RUNTIME_ROLE,
    false
  );
  await verifyRoleConnection(
    "migration",
    urlWithCredentials(config.migrationUrl, MIGRATOR_ROLE, config.migratorPassword),
    MIGRATOR_ROLE,
    true
  );
  await verifyRoleConnection(
    "shadow",
    urlWithCredentials(config.shadowUrl, MIGRATOR_ROLE, config.migratorPassword),
    MIGRATOR_ROLE,
    true
  );
}

if (process.argv.some((argument) => basename(argument) === "configure-postgres-roles.ts")) {
  const config = validateConfiguration();
  const verifyOnly = process.argv.includes("--verify-only");
  if (!verifyOnly) {
    await configureMain(config);
    await configureMigratorDefaults(config);
    await configureShadow(config);
  }
  await verifyConfiguredRoles(config);
  if (!verifyOnly) {
    console.log("PostgreSQL application roles configured on the development and shadow targets.");
  }
  console.log("PostgreSQL runtime, migration, and shadow role verification passed.");
  if (config.shadowUrlNeedsMigratorRole) {
    console.log(
      "POSTGRES_SHADOW_DATABASE_URL still needs to be changed from postgres to app_migrator."
    );
  }
}
