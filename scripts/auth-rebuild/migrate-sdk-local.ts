// Deliberately fixed to the separately provisioned local development target.
// This is not a production migration command and does not load dotenv defaults.
import fs from "node:fs";
import path from "node:path";
import { createHash, X509Certificate } from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";
import { assertPostgresBinding } from "@user-center/next-better-auth/config";
import { privateConfigFile, privateDirectory } from "./files";

const root = path.resolve(".feline-blog/auth-rebuild/local-0.1.6");
const directory = path.join(root, "postgres");
const execution = path.join(directory, "migration-execution");
const canonical = path.resolve("prisma/postgres/migrations");
const expected = {
  host: "127.0.0.1",
  port: 54331,
  database: "feline_blog_sdk_dev",
  runtime: "blog_sdk_runtime",
  maintenance: "blog_sdk_migrator",
  container: "feline-blog-sdk-postgres",
  volume: "feline_blog_sdk_postgres_data",
  instance: "6487556b670603b8f6bc008bd72fc83d",
  system: "7704583393095794729",
};
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const reject = (code: string): never => {
  throw new Error(code);
};
const docker = (args: string[], input?: string) => {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  if (result.status !== 0) reject("LOCAL_DOCKER_CHECK_FAILED");
  return result.stdout.trim();
};
const checks: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  target: {
    host: expected.host,
    port: expected.port,
    database: expected.database,
    maintenance: expected.maintenance,
    runtime: expected.runtime,
  },
  backupExecuted: false,
  restoreExecuted: false,
  rootInitialized: false,
  businessActivated: false,
};
let client: pg.Client | undefined;

async function run() {
  const action = process.argv[2];
  if (!["preflight", "apply", "status"].includes(action)) reject("INVALID_ACTION");
  if (process.versions.node !== "22.21.1") reject("WRONG_NODE_VERSION");
  const state = JSON.parse(
    (await privateConfigFile(path.join(directory, "resource.json"))).toString("utf8")
  );
  if (state.instanceId !== expected.instance || state.phase !== "configured")
    reject("WRONG_RESOURCE_RECORD");
  const container = JSON.parse(docker(["inspect", expected.container, "--format", "{{json .}}"]));
  const volume = JSON.parse(
    docker(["volume", "inspect", expected.volume, "--format", "{{json .}}"])
  );
  const ports = container.HostConfig.PortBindings["5432/tcp"];
  if (
    container.State.Health.Status !== "healthy" ||
    container.Image !== state.imageId ||
    container.Config.Labels["com.feline.sdk.instance"] !== expected.instance ||
    container.Config.Labels["com.docker.compose.project"] !== "feline-blog-sdk-local" ||
    volume.Labels["com.feline.sdk.instance"] !== expected.instance ||
    ports.length !== 1 ||
    ports[0].HostIp !== expected.host ||
    ports[0].HostPort !== String(expected.port) ||
    !container.Mounts.some(
      (m: { Name: string; Destination: string }) =>
        m.Name === expected.volume && m.Destination === "/var/lib/postgresql/data"
    )
  )
    reject("LOCAL_RESOURCE_BINDING_REJECTED");
  const system = docker(
    [
      "exec",
      "--user",
      "postgres",
      "-i",
      expected.container,
      "psql",
      "-XAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "blog_sdk_admin",
      "-d",
      expected.database,
    ],
    "SELECT system_identifier FROM pg_control_system();\n"
  );
  if (system !== expected.system) reject("LOCAL_CLUSTER_IDENTITY_REJECTED");
  const preserved = () =>
    state.protectedFiles.every(
      (f: { file: string; sha256: string }) => hash(fs.readFileSync(f.file)) === f.sha256
    );
  if (!preserved()) reject("PROTECTED_CONFIGURATION_CHANGED");
  const values = dotenv.parse(await privateConfigFile(path.join(root, ".env.maintenance.local")));
  const binding = JSON.parse(
    (await privateConfigFile(path.join(directory, "maintenance.binding.json"))).toString("utf8")
  );
  if (
    binding.hostname !== expected.host ||
    binding.port !== expected.port ||
    binding.database !== expected.database ||
    binding.username !== expected.maintenance ||
    binding.urlEnv !== "POSTGRES_MIGRATION_URL"
  )
    reject("LOCAL_MAINTENANCE_BINDING_REJECTED");
  assertPostgresBinding(values.POSTGRES_MIGRATION_URL, binding);
  const caFile = path.join(directory, "tls/rootCA.pem");
  if (
    !values.POSTGRES_SSL_CA ||
    hash(values.POSTGRES_SSL_CA) !== hash(fs.readFileSync(caFile)) ||
    !new X509Certificate(values.POSTGRES_SSL_CA).ca
  )
    reject("LOCAL_CA_REJECTED");
  const profile = JSON.parse(
    (await privateConfigFile(path.join(root, "integration.profiles.json"))).toString("utf8")
  );
  const appValues = dotenv.parse(await privateConfigFile(path.join(root, ".env.blog.local")));
  if (
    appValues.USER_CENTER_RUNTIME_ENVIRONMENT !== "development" ||
    appValues.USER_CENTER_TARGET_ENVIRONMENT !== "development"
  )
    reject("LOCAL_ENVIRONMENT_REJECTED");
  assertPostgresBinding(
    appValues.PLATFORM_DEVELOPMENT_DATABASE_URL,
    profile.runtimes.development.database
  );
  const appBinding = profile.runtimes.development.database;
  if (
    appBinding.hostname !== expected.host ||
    appBinding.port !== expected.port ||
    appBinding.database !== expected.database ||
    appBinding.username !== expected.runtime
  )
    reject("LOCAL_RUNTIME_BINDING_REJECTED");
  const authHash = hash(
    JSON.stringify({
      centers: profile.centers,
      origin: profile.runtimes.development.platformOrigin,
      clients: profile.runtimes.development.clients,
      session: appValues[profile.runtimes.development.sessionSecretEnv],
      clientSecret: appValues[profile.runtimes.development.clients.development.clientSecretEnv],
    })
  );
  if (authHash !== state.authHash) reject("AUTHENTICATION_CONFIGURATION_CHANGED");
  client = new pg.Client({
    connectionString: values.POSTGRES_MIGRATION_URL,
    ssl: { ca: values.POSTGRES_SSL_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });
  await client.connect();
  const identity = (
    await client.query(`SELECT current_database() AS database,current_user AS username,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
    (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`)
  ).rows[0];
  if (
    identity.database !== expected.database ||
    identity.username !== expected.maintenance ||
    identity.owner !== expected.maintenance ||
    !identity.tls
  )
    reject("LOCAL_DATABASE_IDENTITY_REJECTED");
  checks.identity = identity;
  checks.systemIdentifier = system;

  await privateDirectory(execution);
  const snapshot = path.join(execution, "migrations");
  await privateDirectory(snapshot);
  const names = fs
    .readdirSync(canonical, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const complete = names.filter((name) =>
    fs.existsSync(path.join(canonical, name, "migration.sql"))
  );
  const placeholders = names.filter((name) => !complete.includes(name));
  // An existing empty placeholder is retained in the working tree. Copy every real migration byte for byte.
  if (
    JSON.stringify(placeholders) !== '["20261026000000_center_only_environment"]' ||
    complete.length !== 8 ||
    !complete.includes("20261105090000_user_center_sdk_016")
  )
    reject("MIGRATION_CHAIN_CHANGED");
  const migrations = complete.map((name) => {
    const source = fs.readFileSync(path.join(canonical, name, "migration.sql"));
    fs.mkdirSync(path.join(snapshot, name), { recursive: true });
    fs.writeFileSync(path.join(snapshot, name, "migration.sql"), source);
    return { name, sha256: hash(source) };
  });
  const existingSnapshot = fs
    .readdirSync(snapshot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (JSON.stringify(existingSnapshot) !== JSON.stringify(complete))
    reject("MIGRATION_SNAPSHOT_CHANGED");
  fs.copyFileSync(
    path.join(canonical, "migration_lock.toml"),
    path.join(snapshot, "migration_lock.toml")
  );
  checks.migrations = migrations;
  checks.preservedEmptyPlaceholder = placeholders[0];
  const schema = path.resolve("prisma/postgres/schema.prisma");
  const config = path.join(execution, "prisma.config.ts");
  fs.writeFileSync(
    config,
    'import {defineConfig} from "prisma/config";\nexport default defineConfig({schema:' +
      JSON.stringify(schema) +
      ",migrations:{path:" +
      JSON.stringify(snapshot) +
      "},datasource:{url:process.env.POSTGRES_MIGRATION_URL}});\n"
  );
  const cliUrl = new URL(values.POSTGRES_MIGRATION_URL);
  cliUrl.searchParams.set("sslmode", "require");
  cliUrl.searchParams.set("sslaccept", "strict");
  cliUrl.searchParams.set("sslcert", caFile.replaceAll("\\", "/"));
  const env: NodeJS.ProcessEnv = { ...process.env, POSTGRES_MIGRATION_URL: cliUrl.toString() };
  for (const key of [
    "DATABASE_URL",
    "DIRECT_URL",
    "POSTGRES_SHADOW_DATABASE_URL",
    "PGPASSWORD",
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGSSLMODE",
    "PGSSLROOTCERT",
  ])
    delete env[key];
  const cli = (args: string[], label: string) => {
    const result = spawnSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), ...args, "--config", config],
      { env, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    );
    // CLI diagnostics may contain a DSN. Retain them privately; emit only finite codes.
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
  const statusBefore = cli(["migrate", "status"], "status-before");
  checks.statusBefore = statusBefore;
  if (statusBefore.codes.length || ![0, 1].includes(statusBefore.exit ?? -1))
    reject("LOCAL_PRISMA_STATUS_FAILED");
  const present = (
    await client.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present")
  ).rows[0].present;
  if (action !== "status") {
    const relations = (
      await client.query(
        "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'"
      )
    ).rows[0].count;
    if (present || relations !== 0) reject("LOCAL_TARGET_NO_LONGER_EMPTY");
    checks.emptyTargetVerified = true;
  }
  if (action === "apply") {
    if (!preserved()) reject("PROTECTED_CONFIGURATION_CHANGED");
    const result = cli(["migrate", "deploy"], "deploy");
    checks.deploy = result;
    if (result.exit !== 0) reject("LOCAL_MIGRATE_DEPLOY_FAILED");
    checks.migrationExecuted = true;
    const aclFile = path.resolve("docs/database/plans/0019-sdk-local-runtime.sql");
    checks.runtimeAclSha256 = hash(fs.readFileSync(aclFile));
    checks.runtimeAclInstalled = false;
    await client.query(fs.readFileSync(aclFile, "utf8"));
    checks.runtimeAclInstalled = true;
  }
  if (action === "apply" || action === "status") {
    const statusAfter = cli(["migrate", "status"], "status-after");
    checks.statusAfter = statusAfter;
    if (statusAfter.exit !== 0 || statusAfter.codes.length) reject("LOCAL_PRISMA_STATUS_FAILED");
    const schemaDiff = cli(
      [
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        schema,
        "--exit-code",
        "--script",
      ],
      "schema-diff"
    );
    const diffSql = fs
      .readFileSync(path.join(execution, "schema-diff.log"), "utf8")
      .split("Loaded Prisma config from")[0]
      .replaceAll("\r\n", "\n")
      .trim();
    const diffSha256 = hash(diffSql);
    // Exact reviewed baseline drift, confined to seven inactive legacy auth FKs.
    // Any changed or additional difference fails instead of being silently accepted.
    const knownLegacyDiff =
      schemaDiff.exit === 2 &&
      diffSha256 === "3ed9b3ab644b2947795a072ad55c3f9f7fbbdb4d9274690168295cb18babad84";
    checks.schemaDiff = {
      ...schemaDiff,
      status: knownLegacyDiff
        ? "KNOWN_LEGACY_FK_DRIFT"
        : schemaDiff.exit === 0
          ? "MATCH"
          : "FAILED",
      diffSha256,
    };
    if (schemaDiff.codes.length || (schemaDiff.exit !== 0 && !knownLegacyDiff))
      reject("LOCAL_SCHEMA_DIFF_UNREVIEWED");
    const rows = (
      await client.query(
        "SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name"
      )
    ).rows;
    if (
      rows.length !== migrations.length ||
      rows.some(
        (row, i) =>
          !row.finished ||
          row.rolled_back ||
          row.migration_name !== migrations[i].name ||
          row.checksum !== migrations[i].sha256
      )
    )
      reject("LOCAL_MIGRATION_HISTORY_MISMATCH");
    checks.appliedCount = rows.length;
    checks.historyMatchesCanonical = true;
    const installation = (
      await client.query(
        'SELECT id,phase,revision,"targetGeneration", "rootUserId" IS NULL AS no_root,"restoreRunId" IS NULL AS no_restore,"activatedAt" IS NULL AS not_activated FROM public."AuthInstallState"'
      )
    ).rows;
    checks.installation = installation;
    if (
      installation.length !== 1 ||
      installation[0].phase !== "awaiting_root" ||
      installation[0].revision !== 0 ||
      !installation[0].no_root ||
      !installation[0].no_restore ||
      !installation[0].not_activated
    )
      reject("LOCAL_INSTALLATION_STATE_UNEXPECTED");
    checks.userCount = (
      await client.query("SELECT count(*)::int AS count FROM public.users")
    ).rows[0].count;
    if (checks.userCount !== 0) reject("LOCAL_TARGET_HAS_USERS");
    checks.cleanup = (
      await client.query(
        "SELECT cron_job_id IS NULL AS no_job,activated_at IS NULL AS inactive,last_result,history_mode FROM auth_ops.cleanup_state"
      )
    ).rows;
  }
  checks.protectedConfigurationsUnchanged = preserved();
  if (!checks.protectedConfigurationsUnchanged) reject("PROTECTED_CONFIGURATION_CHANGED");
  checks.action = action;
  checks.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(execution, action + ".json"), JSON.stringify(checks, null, 2) + "\n");
  console.log(JSON.stringify(checks, null, 2));
}
try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  checks.failure = /^[A-Z_]+$/.test(message) ? message : "LOCAL_MIGRATION_CHECK_FAILED";
  checks.sqlState =
    typeof (error as { code?: string }).code === "string" &&
    /^[A-Z0-9_]{5}$/.test((error as { code: string }).code)
      ? (error as { code: string }).code
      : undefined;
  if (fs.existsSync(execution))
    fs.writeFileSync(path.join(execution, "failure.json"), JSON.stringify(checks, null, 2) + "\n");
  console.error(JSON.stringify(checks, null, 2));
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
