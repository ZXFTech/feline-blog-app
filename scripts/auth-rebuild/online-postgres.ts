import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import {
  randomBytes,
  createHash,
  X509Certificate,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { onlineTarget as target, onlineDirectory } from "./online-target";
import { privateDirectory, privateConfigFile } from "./files";

const directory = () => path.join(onlineDirectory(), "postgres");
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export async function assertOnlineStorageReady(poolConfig: pg.PoolConfig) {
  const client = new pg.Client({
    ...poolConfig,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const row = (
      await client.query(
        "SELECT current_database() AS database,current_user AS username,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT count(*)::int FROM public.\"AuthInstallState\" WHERE id='primary') AS installation_rows"
      )
    ).rows[0];
    if (
      row.database !== target.database ||
      row.username !== target.runtimeRole ||
      !row.tls ||
      row.installation_rows !== 1
    )
      throw Error("ONLINE_LOCAL_STORAGE_NOT_READY");
  } catch {
    throw Error("ONLINE_LOCAL_STORAGE_NOT_READY");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}
type Resource = {
  phase: string;
  instanceId: string;
  imageId: string;
  systemIdentifier?: string;
  existingContainers: string[];
  existingVolumes: string[];
  protectedFiles: { file: string; sha256: string }[];
};
type Container = {
  Name: string;
  Image: string;
  Config: { Image: string; Env: string[]; Labels: Record<string, string> };
  State: { Health?: { Status: string } };
  Mounts: { Name?: string; Destination: string; Source: string }[];
  HostConfig: { PortBindings: Record<string, { HostIp: string; HostPort: string }[]> };
};
function rawDocker(args: string[], input?: string) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 1048576,
  });
  if (result.status !== 0) throw Error("ONLINE_LOCAL_DOCKER_FAILED");
  return result.stdout.trim();
}
export function dockerCommand(args: string[], input?: string) {
  if (process.env.DOCKER_HOST?.trim()) throw Error("DOCKER_ENDPOINT_OVERRIDE_REJECTED");
  const context = rawDocker(["context", "show"]);
  if (!["default", "desktop-linux"].includes(context))
    throw Error("NONLOCAL_DOCKER_CONTEXT_REJECTED");
  const endpoint = rawDocker([
    "context",
    "inspect",
    context,
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!/^npipe:\/\/\/\/\.\/pipe\/(?:docker_engine|dockerDesktopLinuxEngine)$/i.test(endpoint))
    throw Error("NONLOCAL_DOCKER_ENDPOINT_REJECTED");
  return rawDocker(["--context", context, ...args], input);
}
const compose = (args: string[]) =>
  dockerCommand([
    "compose",
    "--project-name",
    target.project,
    "--file",
    path.join(directory(), "compose.yaml"),
    ...args,
  ]);
export async function readOnlineResource(): Promise<Resource> {
  return JSON.parse(
    (await privateConfigFile(path.join(directory(), "resource.json"))).toString("utf8")
  );
}
const save = (state: Resource) =>
  fs.writeFileSync(path.join(directory(), "resource.json"), JSON.stringify(state, null, 2) + "\n");
export function assertOnlineResources(state: Resource) {
  if (!/^[a-f0-9]{32}$/.test(state.instanceId)) throw Error("ONLINE_LOCAL_RESOURCE_INVALID");
  const actual = JSON.parse(
    dockerCommand(["inspect", target.container, "--format", "{{json .}} "])
  ) as Container;
  const volume = JSON.parse(
    dockerCommand(["volume", "inspect", target.volume, "--format", "{{json .}} "])
  ) as { Labels: Record<string, string> };
  const ports = actual.HostConfig.PortBindings["5432/tcp"];
  if (
    actual.Name !== "/" + target.container ||
    actual.Image !== state.imageId ||
    actual.Config.Image !== target.image ||
    actual.Config.Labels["com.feline.sdk.instance"] !== state.instanceId ||
    actual.Config.Labels["com.docker.compose.project"] !== target.project ||
    volume.Labels["com.feline.sdk.instance"] !== state.instanceId ||
    volume.Labels["com.feline.sdk.purpose"] !== "isolated-online-center-development" ||
    ports?.length !== 1 ||
    ports[0].HostIp !== "127.0.0.1" ||
    ports[0].HostPort !== String(target.databasePort) ||
    !actual.Mounts.some(
      (m) => m.Name === target.volume && m.Destination === "/var/lib/postgresql/data"
    ) ||
    actual.Config.Env.some((value) => /^(POSTGRES_PASSWORD|PGPASSWORD)=/.test(value)) ||
    actual.Mounts.some((m) => /rootCA-key/i.test(m.Source))
  )
    throw Error("ONLINE_LOCAL_RESOURCE_BINDING_REJECTED");
  if (state.protectedFiles.some((item) => digest(fs.readFileSync(item.file)) !== item.sha256))
    throw Error("PROTECTED_CONFIGURATION_CHANGED");
  return actual;
}
export function onlineAdminSql(sql: string, database = "postgres") {
  return dockerCommand(
    [
      "exec",
      "-i",
      "--user",
      "postgres",
      target.container,
      "psql",
      "-XAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      target.adminRole,
      "-d",
      database,
    ],
    sql
  );
}
export function verifyExistingResources(
  previous: { existingContainers: string[]; existingVolumes: string[] },
  containers: Set<string>,
  volumes: Set<string>
) {
  const missing = previous.existingContainers.filter((item) => !containers.has(item));
  const protectedMissing = missing.filter((item) =>
    /^(?:feline-blog|feline-center-only|user-center)(?:-|$)/.test(item.split(" ").at(-1) ?? "")
  );
  if (protectedMissing.length || previous.existingVolumes.some((item) => !volumes.has(item)))
    throw Error("EXISTING_PROTECTED_RESOURCES_CHANGED");
  return {
    protectedResourcesPreserved: true,
    existingResourcesPreserved: missing.length === 0,
    unrelatedContainerChanges: missing.length,
  };
}
async function credentials(): Promise<{ admin: string; runtime: string; maintenance: string }> {
  const values = JSON.parse(
    (await privateConfigFile(path.join(directory(), "secrets/credentials.json"))).toString("utf8")
  );
  if (
    Object.keys(values).sort().join(",") !== "admin,maintenance,runtime" ||
    [values.admin, values.runtime, values.maintenance].some(
      (value) => typeof value !== "string" || !/^[a-zA-Z0-9_-]{64}$/.test(value)
    )
  )
    throw Error("ONLINE_LOCAL_CREDENTIALS_INVALID");
  return values;
}
async function prepareDatabase() {
  try {
    fs.lstatSync(directory());
    throw Error("ONLINE_LOCAL_RESOURCES_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const existingContainers = dockerCommand(["ps", "-a", "--format", "{{.ID}} {{.Names}}"])
    .split("\n")
    .filter(Boolean);
  const existingVolumes = dockerCommand(["volume", "ls", "--format", "{{.Name}}"])
    .split("\n")
    .filter(Boolean);
  if (
    existingContainers.some((line) => line.endsWith(" " + target.container)) ||
    existingVolumes.includes(target.volume)
  )
    throw Error("ONLINE_LOCAL_NAME_IN_USE");
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(Error("ONLINE_LOCAL_PORT_IN_USE")));
    server.listen(target.databasePort, "127.0.0.1", () => server.close(() => resolve()));
  });
  const imageId = dockerCommand(["image", "inspect", target.image, "--format", "{{.Id}}"]);
  const protectedPaths = [
    ".env.production",
    ".env.staging",
    ".env.local",
    ".feline-blog/auth-rebuild/integration.template.json",
    ".feline-blog/auth-rebuild/runtime.env.template",
    ".feline-blog/auth-rebuild/source.env.template",
    ".feline-blog/auth-rebuild/maintenance.env.template",
    ".feline-blog/auth-rebuild/local-0.1.6/integration.profiles.json",
    ".feline-blog/auth-rebuild/local-0.1.6/.env.blog.local",
    ".feline-blog/auth-rebuild/local-0.1.6/.env.maintenance.local",
    "../user-center/.env.local",
    "../user-center/.env.production",
  ].filter((file) => fs.existsSync(file));
  const protectedFiles = protectedPaths.map((file) => ({
    file,
    sha256: digest(fs.readFileSync(file)),
  }));
  await privateDirectory(directory());
  await privateDirectory(path.join(directory(), "secrets"));
  await privateDirectory(path.join(directory(), "tls"));
  const secrets = {
    admin: randomBytes(48).toString("base64url"),
    runtime: randomBytes(48).toString("base64url"),
    maintenance: randomBytes(48).toString("base64url"),
  };
  fs.writeFileSync(
    path.join(directory(), "secrets/credentials.json"),
    JSON.stringify(secrets) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  fs.writeFileSync(path.join(directory(), "secrets/admin-password.txt"), secrets.admin + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  const caRoot = path.join(process.env.LOCALAPPDATA ?? "", "mkcert");
  const ca = fs.readFileSync(path.join(caRoot, "rootCA.pem"));
  if (digest(ca) !== digest(fs.readFileSync(".feline-blog/auth-rebuild/local/tls/rootCA.pem")))
    throw Error("EXISTING_CA_MISMATCH");
  fs.writeFileSync(path.join(directory(), "tls/rootCA.pem"), ca, { flag: "wx" });
  const mkcert = path.resolve("../user-center/.local/tools/mkcert.exe");
  if (
    digest(fs.readFileSync(mkcert)) !==
    "d2660b50a9ed59eada480750561c96abc2ed4c9a38c6a24d93e30e0977631398"
  )
    throw Error("MKCERT_DIGEST_MISMATCH");
  const cert = path.join(directory(), "tls/server.pem"),
    key = path.join(directory(), "tls/server-key.pem");
  const issued = spawnSync(
    mkcert,
    ["-cert-file", cert, "-key-file", key, "127.0.0.1", "localhost"],
    { env: { ...process.env, CAROOT: caRoot }, encoding: "utf8", windowsHide: true, timeout: 30000 }
  );
  if (issued.status !== 0) throw Error("ONLINE_LOCAL_CERTIFICATE_FAILED");
  const leaf = new X509Certificate(fs.readFileSync(cert)),
    root = new X509Certificate(ca),
    privateKey = createPrivateKey(await privateConfigFile(key));
  if (
    !root.ca ||
    !leaf.checkIP("127.0.0.1") ||
    !leaf.checkHost("localhost") ||
    !leaf.verify(root.publicKey) ||
    !leaf.publicKey
      .export({ type: "spki", format: "der" })
      .equals(createPublicKey(privateKey).export({ type: "spki", format: "der" }))
  )
    throw Error("ONLINE_LOCAL_CERTIFICATE_INVALID");
  fs.writeFileSync(
    path.join(directory(), "entrypoint.sh"),
    '#!/bin/bash\nset -euo pipefail\ninstall -d -o postgres -g postgres -m 0700 /run/sdk-postgres-tls\ninstall -o postgres -g postgres -m 0600 /run/secrets/server_key /run/sdk-postgres-tls/server.key\ninstall -o postgres -g postgres -m 0644 /opt/sdk/server.pem /run/sdk-postgres-tls/server.crt\nexec /usr/local/bin/docker-entrypoint.sh "$@"\n',
    { flag: "wx" }
  );
  fs.writeFileSync(
    path.join(directory(), "pg_ident.conf"),
    `sdk_admin postgres ${target.adminRole}\n`,
    { flag: "wx" }
  );
  fs.writeFileSync(
    path.join(directory(), "pg_hba.conf"),
    `local all ${target.adminRole} peer map=sdk_admin\nlocal all all reject\nhostnossl all all 0.0.0.0/0 reject\nhostnossl all all ::/0 reject\nhostssl ${target.database} ${target.runtimeRole} 0.0.0.0/0 scram-sha-256\nhostssl ${target.database} ${target.maintenanceRole} 0.0.0.0/0 scram-sha-256\nhostssl ${target.database} ${target.runtimeRole} ::/0 scram-sha-256\nhostssl ${target.database} ${target.maintenanceRole} ::/0 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n`,
    { flag: "wx" }
  );
  const instanceId = randomBytes(16).toString("hex");
  const labels = {
    "com.feline.sdk.instance": instanceId,
    "com.feline.sdk.purpose": "isolated-online-center-development",
  };
  const config = {
    name: target.project,
    services: {
      postgres: {
        image: target.image,
        container_name: target.container,
        restart: "unless-stopped",
        entrypoint: ["/bin/bash", "/opt/sdk/entrypoint.sh"],
        command: [
          "postgres",
          "-c",
          "ssl=on",
          "-c",
          "ssl_cert_file=/run/sdk-postgres-tls/server.crt",
          "-c",
          "ssl_key_file=/run/sdk-postgres-tls/server.key",
          "-c",
          "ssl_min_protocol_version=TLSv1.2",
          "-c",
          "hba_file=/opt/sdk/pg_hba.conf",
          "-c",
          "ident_file=/opt/sdk/pg_ident.conf",
          "-c",
          "password_encryption=scram-sha-256",
          "-c",
          "log_statement=none",
          "-c",
          "log_min_error_statement=panic",
          "-c",
          "max_connections=30",
        ],
        environment: {
          POSTGRES_USER: target.adminRole,
          POSTGRES_DB: "postgres",
          POSTGRES_PASSWORD_FILE: "/run/secrets/admin_password",
          POSTGRES_INITDB_ARGS: "--auth-local=peer --auth-host=scram-sha-256",
        },
        ports: [
          {
            target: 5432,
            published: String(target.databasePort),
            host_ip: "127.0.0.1",
            protocol: "tcp",
          },
        ],
        volumes: [
          { type: "volume", source: "data", target: "/var/lib/postgresql/data" },
          ...["entrypoint.sh", "pg_hba.conf", "pg_ident.conf"].map((file) => ({
            type: "bind",
            source: path.join(directory(), file),
            target: "/opt/sdk/" + file,
            read_only: true,
          })),
          { type: "bind", source: cert, target: "/opt/sdk/server.pem", read_only: true },
        ],
        secrets: ["admin_password", "server_key"],
        tmpfs: ["/run/sdk-postgres-tls:rw,noexec,nosuid,size=1m"],
        labels,
        healthcheck: {
          test: [
            "CMD",
            "gosu",
            "postgres",
            "pg_isready",
            "-q",
            "-U",
            target.adminRole,
            "-d",
            "postgres",
          ],
          interval: "3s",
          timeout: "3s",
          retries: 20,
          start_period: "5s",
        },
        logging: { driver: "json-file", options: { "max-size": "5m", "max-file": "2" } },
        mem_limit: "512m",
      },
    },
    volumes: { data: { name: target.volume, labels } },
    secrets: {
      admin_password: { file: path.join(directory(), "secrets/admin-password.txt") },
      server_key: { file: key },
    },
  };
  fs.writeFileSync(path.join(directory(), "compose.yaml"), JSON.stringify(config, null, 2) + "\n", {
    flag: "wx",
  });
  save({
    phase: "prepared",
    instanceId,
    imageId,
    existingContainers,
    existingVolumes,
    protectedFiles,
  });
  compose(["config", "--quiet"]);
}
async function initializeDatabase() {
  const state = await readOnlineResource();
  if (state.phase !== "started") throw Error("ONLINE_LOCAL_RESOURCE_PHASE_REJECTED");
  if (assertOnlineResources(state).State.Health?.Status !== "healthy")
    throw Error("ONLINE_LOCAL_DATABASE_NOT_READY");
  const secret = await credentials();
  const counts = onlineAdminSql(
    `SELECT count(*) FROM pg_database WHERE datname='${target.database}';SELECT count(*) FROM pg_roles WHERE rolname IN ('${target.runtimeRole}','${target.maintenanceRole}');\n`
  ).split(/\s+/);
  if (counts.some((value) => value !== "0")) throw Error("ONLINE_LOCAL_DATABASE_ALREADY_EXISTS");
  onlineAdminSql(
    `BEGIN;CREATE ROLE ${target.runtimeRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD '${secret.runtime}';CREATE ROLE ${target.maintenanceRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3 PASSWORD '${secret.maintenance}';ALTER ROLE ${target.runtimeRole} SET statement_timeout='10s';ALTER ROLE ${target.runtimeRole} SET lock_timeout='3s';ALTER ROLE ${target.runtimeRole} SET idle_in_transaction_session_timeout='30s';COMMIT;\n`
  );
  onlineAdminSql(
    `CREATE DATABASE ${target.database} OWNER ${target.maintenanceRole} TEMPLATE template0 ENCODING 'UTF8';REVOKE ALL ON DATABASE ${target.database} FROM PUBLIC;GRANT CONNECT ON DATABASE ${target.database} TO ${target.runtimeRole};\n`
  );
  onlineAdminSql(
    `ALTER SCHEMA public OWNER TO ${target.maintenanceRole};REVOKE ALL ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO ${target.runtimeRole};ALTER DEFAULT PRIVILEGES FOR ROLE ${target.maintenanceRole} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;ALTER DEFAULT PRIVILEGES FOR ROLE ${target.maintenanceRole} REVOKE USAGE ON TYPES FROM PUBLIC;\n`,
    target.database
  );
  state.systemIdentifier = onlineAdminSql(
    "SELECT system_identifier FROM pg_control_system();\n",
    target.database
  );
  const ca = fs.readFileSync(path.join(directory(), "tls/rootCA.pem"), "utf8");
  const url = (user: string, password: string) =>
    `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${target.databasePort}/${target.database}`;
  fs.writeFileSync(
    path.join(onlineDirectory(), ".env.maintenance.local"),
    "# Only this new local database. Never load into Next.\nPOSTGRES_MIGRATION_URL=" +
      JSON.stringify(url(target.maintenanceRole, secret.maintenance)) +
      "\nPOSTGRES_SSL_CA=" +
      JSON.stringify(ca) +
      "\n",
    { flag: "wx", mode: 0o600 }
  );
  fs.writeFileSync(
    path.join(directory(), "maintenance.binding.json"),
    JSON.stringify(
      {
        hostname: "127.0.0.1",
        port: target.databasePort,
        database: target.database,
        username: target.maintenanceRole,
        urlEnv: "POSTGRES_MIGRATION_URL",
      },
      null,
      2
    ) + "\n",
    { flag: "wx" }
  );
  const envFile = path.join(onlineDirectory(), ".env.blog.local");
  const before = (await privateConfigFile(envFile)).toString("utf8");
  if (dotenv.parse(before)[target.databaseUrlEnv])
    throw Error("ONLINE_LOCAL_RUNTIME_URL_ALREADY_SET");
  fs.writeFileSync(
    envFile,
    before.replace(
      new RegExp("^" + target.databaseUrlEnv + "=.*$", "m"),
      () => target.databaseUrlEnv + "=" + JSON.stringify(url(target.runtimeRole, secret.runtime))
    )
  );
  await privateConfigFile(path.join(onlineDirectory(), ".env.maintenance.local"));
  state.phase = "initialized";
  save(state);
}
export async function setupOnlineDatabase() {
  await prepareDatabase();
  const state = await readOnlineResource();
  if (
    dockerCommand(["volume", "ls", "--format", "{{.Name}}"]).split("\n").includes(target.volume) ||
    dockerCommand(["ps", "-a", "--format", "{{.Names}}"]).split("\n").includes(target.container)
  )
    throw Error("ONLINE_LOCAL_RESOURCE_ALREADY_EXISTS");
  compose(["up", "-d", "--pull", "never", "--no-build"]);
  state.phase = "started";
  save(state);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (assertOnlineResources(state).State.Health?.Status === "healthy") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await initializeDatabase();
  return verifyOnlineDatabase(true);
}
export async function verifyOnlineDatabase(requireEmpty = false) {
  const state = await readOnlineResource();
  assertOnlineResources(state);
  if (
    !state.systemIdentifier ||
    onlineAdminSql("SELECT system_identifier FROM pg_control_system();\n", target.database) !==
      state.systemIdentifier
  )
    throw Error("ONLINE_LOCAL_CLUSTER_MISMATCH");
  const secret = await credentials(),
    ca = fs.readFileSync(path.join(directory(), "tls/rootCA.pem"), "utf8");
  const check = async (user: string, password: string, ssl: pg.ConnectionConfig["ssl"]) => {
    const client = new pg.Client({
      host: "127.0.0.1",
      port: target.databasePort,
      database: target.database,
      user,
      password,
      ssl,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      await client.connect();
      return (
        await client.query(
          `SELECT current_database() AS database,current_user AS username,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT version FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls_version,has_schema_privilege(current_user,'public','CREATE') AS can_create,has_database_privilege(current_user,current_database(),'TEMP') AS can_temp,(SELECT count(*)::int FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS memberships,(SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit FROM pg_roles WHERE rolname=current_user) AS dangerous_role,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS relations`
        )
      ).rows[0];
    } finally {
      await client.end().catch(() => {});
    }
  };
  const runtime = await check(target.runtimeRole, secret.runtime, { ca, rejectUnauthorized: true });
  const maintenance = await check(target.maintenanceRole, secret.maintenance, {
    ca,
    rejectUnauthorized: true,
  });
  if (
    !runtime.tls ||
    !maintenance.tls ||
    runtime.username !== target.runtimeRole ||
    maintenance.username !== target.maintenanceRole ||
    runtime.database !== target.database ||
    maintenance.database !== target.database ||
    runtime.database_owner !== target.maintenanceRole ||
    maintenance.database_owner !== target.maintenanceRole ||
    runtime.dangerous_role ||
    maintenance.dangerous_role ||
    runtime.memberships ||
    maintenance.memberships ||
    runtime.can_create ||
    runtime.can_temp ||
    !maintenance.can_create ||
    (requireEmpty && (runtime.relations !== 0 || maintenance.relations !== 0))
  )
    throw Error("ONLINE_LOCAL_PRIVILEGE_CHECK_FAILED");
  let plaintextRejected = false,
    wrongHostnameRejected = false;
  try {
    await check(target.runtimeRole, secret.runtime, false);
  } catch (error) {
    plaintextRejected = (error as { code?: string }).code === "28000";
  }
  try {
    await check(target.runtimeRole, secret.runtime, {
      ca,
      rejectUnauthorized: true,
      servername: "wrong-online-local-db.invalid",
    });
  } catch (error) {
    wrongHostnameRejected = (error as { code?: string }).code === "ERR_TLS_CERT_ALTNAME_INVALID";
  }
  if (!plaintextRejected || !wrongHostnameRejected) throw Error("ONLINE_LOCAL_TLS_NEGATIVE_FAILED");
  const currentContainers = new Set(
    dockerCommand(["ps", "-a", "--format", "{{.ID}} {{.Names}}"]).split("\n")
  );
  const currentVolumes = new Set(
    dockerCommand(["volume", "ls", "--format", "{{.Name}}"]).split("\n")
  );
  const preservation = verifyExistingResources(state, currentContainers, currentVolumes);
  const result = {
    checkedAt: new Date().toISOString(),
    host: "127.0.0.1",
    port: target.databasePort,
    database: target.database,
    systemIdentifier: state.systemIdentifier,
    runtime,
    maintenance,
    plaintextRejected,
    wrongHostnameRejected,
    ...preservation,
    protectedConfigurationsUnchanged: true,
    emptyRequired: requireEmpty,
    backupExecuted: false,
    restoreExecuted: false,
  };
  fs.writeFileSync(
    path.join(directory(), "verification.json"),
    JSON.stringify(result, null, 2) + "\n"
  );
  return result;
}
