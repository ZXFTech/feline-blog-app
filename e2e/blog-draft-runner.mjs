import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  describeIntegration,
  resolveEnvironmentConfig,
} from "@user-center/next-better-auth/config";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.join(root, ".feline-blog", "blog-drafts-e2e");
const appOrigin = "https://blog.user-center.test:3446";
const issuer = "https://127.0.0.1:3447/api/auth";
const databaseHost = "127.0.0.1:55446";
const databaseName = "feline_blog_sdk_dev";
const owner = "blog_sdk_migrator";
const runtime = "blog_sdk_runtime";
const image =
  "postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652";
const dockerName = "feline-blog-drafts-playwright";
const label = "feline.blog-drafts.fixture";
const hostEnvironment = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "APPDATA",
  "SystemRoot",
  "windir",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  "PLAYWRIGHT_BROWSERS_PATH",
];
const sharedFixtureEnvironment = [
  "USER_CENTER_CONFIG_FILE",
  "USER_CENTER_RUNTIME_ENVIRONMENT",
  "USER_CENTER_TARGET_ENVIRONMENT",
  "LOCAL_TO_DEVELOPMENT_CLIENT_SECRET",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "BLOG_DRAFT_E2E_ORIGIN",
  "BLOG_DRAFT_E2E_CA_FILE",
  "BLOG_DRAFT_E2E_CERT",
  "BLOG_DRAFT_E2E_KEY",
];
const appFixtureEnvironment = [
  "PLATFORM_DEVELOPMENT_SESSION_SECRET",
  "PLATFORM_DEVELOPMENT_POSTGRES_SCHEMA",
  "PLATFORM_DEVELOPMENT_DATABASE_URL",
  "PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA",
  "FELINE_SDK_DEV_TARGET",
  "NEXT_TELEMETRY_DISABLED",
];

function selectEnvironment(keys) {
  return Object.fromEntries(
    keys.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
  );
}

function command(binary, args, options = {}) {
  return spawnSync(binary, args, {
    cwd: root,
    encoding: "utf8",
    env: selectEnvironment(hostEnvironment),
    ...options,
  });
}

function mustRun(binary, args, stage, options) {
  const result = command(binary, args, options);
  if (result.status !== 0) throw new Error(stage + " failed.");
  return result.stdout?.trim();
}

function generateTls(directory) {
  const gitOpenSsl = "C:/Program Files/Git/usr/bin/openssl.exe";
  const openssl =
    process.env.BLOG_DRAFT_E2E_OPENSSL ??
    (process.platform === "win32" && existsSync(gitOpenSsl) ? gitOpenSsl : "openssl");
  const options = {
    cwd: directory,
    env: { ...selectEnvironment(hostEnvironment), MSYS2_ARG_CONV_EXCL: "*" },
  };
  const ca = path.join(directory, "ca.pem");
  const key = path.join(directory, "server.key");
  const cert = path.join(directory, "server.pem");
  mustRun(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "ca.key",
      "-out",
      "ca.pem",
      "-days",
      "2",
      "-subj",
      "/CN=Feline disposable draft test CA",
    ],
    "Test TLS CA generation",
    options
  );
  mustRun(
    openssl,
    [
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "server.key",
      "-out",
      "server.csr",
      "-subj",
      "/CN=blog.user-center.test",
    ],
    "Test TLS key generation",
    options
  );
  writeFileSync(
    path.join(directory, "cert.ext"),
    "subjectAltName=DNS:blog.user-center.test,DNS:localhost,IP:127.0.0.1\n"
  );
  mustRun(
    openssl,
    [
      "x509",
      "-req",
      "-in",
      "server.csr",
      "-CA",
      "ca.pem",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "server.pem",
      "-days",
      "2",
      "-extfile",
      "cert.ext",
    ],
    "Test TLS certificate signing",
    options
  );
  return { ca, key, cert };
}

const secret = () => randomBytes(32).toString("hex");
const source = (file) => readFileSync(path.join(root, file), "utf8");

function prepare(directory) {
  const { ca, key, cert } = generateTls(directory);
  const ownerPassword = secret();
  const runtimePassword = secret();
  const database = (user, password) =>
    `postgresql://${user}:${password}@${databaseHost}/${databaseName}`;
  const init = path.join(directory, "postgres-init.sql");
  const postgres = path.join(directory, "postgres.env");
  writeFileSync(postgres, "POSTGRES_PASSWORD=" + secret() + "\n", { mode: 0o600 });
  writeFileSync(
    init,
    [
      `CREATE ROLE ${owner} LOGIN PASSWORD '${ownerPassword}' NOINHERIT NOBYPASSRLS;`,
      `CREATE ROLE ${runtime} LOGIN PASSWORD '${runtimePassword}' NOINHERIT NOBYPASSRLS;`,
      `CREATE DATABASE ${databaseName} OWNER ${owner} TEMPLATE template0 ENCODING 'UTF8';`,
      `GRANT CONNECT ON DATABASE ${databaseName} TO ${runtime};`,
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
  const profileFile = path.join(directory, "profiles.json");
  const profile = JSON.parse(source("config/user-center.profiles.example.json"));
  profile.centers.development = issuer;
  Object.assign(profile.runtimes.development, {
    platformOrigin: appOrigin,
    clients: {
      development: {
        clientId: "draft-fixture-client",
        clientSecretEnv: "LOCAL_TO_DEVELOPMENT_CLIENT_SECRET",
      },
    },
    database: {
      urlEnv: "PLATFORM_DEVELOPMENT_DATABASE_URL",
      hostname: "127.0.0.1",
      port: 55446,
      database: databaseName,
      username: runtime,
    },
  });
  writeFileSync(profileFile, JSON.stringify(profile, null, 2));
  const { manifest } = resolveEnvironmentConfig(profile, { runtimeEnvironment: "development" });
  const env = {
    ...selectEnvironment(hostEnvironment),
    USER_CENTER_CONFIG_FILE: profileFile,
    USER_CENTER_RUNTIME_ENVIRONMENT: "development",
    USER_CENTER_TARGET_ENVIRONMENT: "development",
    LOCAL_TO_DEVELOPMENT_CLIENT_SECRET: secret(),
    PLATFORM_DEVELOPMENT_SESSION_SECRET: secret(),
    PLATFORM_DEVELOPMENT_POSTGRES_SCHEMA: "public",
    PLATFORM_DEVELOPMENT_DATABASE_URL: database(runtime, runtimePassword),
    PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA: readFileSync(ca, "utf8"),
    NODE_EXTRA_CA_CERTS: ca,
    NODE_TLS_REJECT_UNAUTHORIZED: "1",
    FELINE_SDK_DEV_TARGET: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    BLOG_DRAFT_E2E_ORIGIN: appOrigin,
    BLOG_DRAFT_E2E_CA_FILE: ca,
    BLOG_DRAFT_E2E_CERT: cert,
    BLOG_DRAFT_E2E_KEY: key,
    BLOG_DRAFT_E2E_DATABASE_URL: database(owner, ownerPassword),
  };
  return { ca, key, cert, init, postgres, manifest, env };
}

async function waitForDatabase(id) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = command("docker", [
      "exec",
      id,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      owner,
      "-d",
      databaseName,
    ]);
    if (result.status === 0) return;
    await setTimeout(500);
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

async function seedDatabase({ ca, manifest, env }) {
  const ownerUrl = new URL(env.BLOG_DRAFT_E2E_DATABASE_URL);
  const client = new Client({
    connectionString: ownerUrl.href,
    ssl: { ca: readFileSync(ca, "utf8"), rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const empty = await client.query(
      "SELECT count(*)::integer AS tables FROM pg_tables WHERE schemaname='public'"
    );
    if (empty.rows[0].tables !== 0) throw new Error("Expected an empty disposable database.");
    ownerUrl.searchParams.set("sslmode", "verify-full");
    ownerUrl.searchParams.set("sslrootcert", ca);
    mustRun(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--config",
        "prisma.postgres.config.ts",
      ],
      "Disposable Prisma migration",
      { env: { ...env, POSTGRES_MIGRATION_URL: ownerUrl.href } }
    );
    await client.query(source("docs/database/plans/0019-sdk-local-runtime.sql"));
    await client.query("BEGIN");
    const { providerId } = describeIntegration(manifest);
    for (const [name, role] of [
      ["author", "ROOT"],
      ["other", "ROOT"],
      ["reader", "USER"],
    ]) {
      const id = "draft-fixture-" + name;
      await client.query(
        `INSERT INTO public.users
          (id,email,username,name,"emailVerified",role,"updateAt","updatedAt","profileCompletedAt",
           "profileEmailSnapshot","profileEmailConfirmedAt","businessCreatedAt","businessUpdatedAt")
         VALUES ($1,$2::citext,$3::text,$3::text,true,$4,now(),now(),now(),$2::citext,now(),now(),now())`,
        [id, name + "@drafts.example.test", "Draft fixture " + name, role]
      );
      await client.query(
        `INSERT INTO public.auth_accounts (id,"providerId","accountId","userId","updatedAt")
         VALUES ($1,$2,$3::text,$3::varchar,now())`,
        [randomUUID(), providerId, id]
      );
    }
    const state = await client.query(
      `SELECT "targetGeneration" FROM public."AuthInstallState" WHERE id='primary'`
    );
    const receipt = randomUUID();
    const digest = "d".repeat(64);
    const author = "draft-fixture-author";
    await client.query(
      `INSERT INTO public."BusinessRestoreRun"
        (id,"backupId","manifestSha256","planDigest","targetGeneration","sourceUserId",
         "targetUserId","rowCounts","contentDigest","completedAt")
        VALUES ($1,$2,$3,$3,$4,$5,$5,'{}'::jsonb,$3,now())`,
      [receipt, randomUUID(), digest, state.rows[0].targetGeneration, author]
    );
    await client.query(
      `UPDATE public."AuthInstallState" SET phase='ready',revision=3,"rootUserId"=$1,
        "rootInitializedAt"=now(),"rootIssuer"=$2,"rootSubjectDigest"=$3,"bootstrapPlanDigest"=$3,
        "restoreRunId"=$4,"activationPlanDigest"=$3,"activationEvidenceRef"='disposable-draft-test',
        "activationEvidenceSha256"=$3,"activatedAt"=now() WHERE id='primary'`,
      [author, issuer, digest, receipt]
    );
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

function ownsFixtureDirectory(directory) {
  return (
    path.dirname(directory) === realpathSync(artifacts) &&
    path.basename(directory).startsWith("fixture-") &&
    realpathSync(directory) === directory
  );
}

function validateFixtureEnvironment() {
  const profileFile = process.env.USER_CENTER_CONFIG_FILE;
  const directory = path.dirname(realpathSync(profileFile));
  if (!ownsFixtureDirectory(directory)) throw new Error("Expected a disposable fixture directory.");
  const expectedFiles = {
    USER_CENTER_CONFIG_FILE: "profiles.json",
    BLOG_DRAFT_E2E_KEY: "server.key",
    BLOG_DRAFT_E2E_CERT: "server.pem",
    BLOG_DRAFT_E2E_CA_FILE: "ca.pem",
    NODE_EXTRA_CA_CERTS: "ca.pem",
  };
  for (const [variable, name] of Object.entries(expectedFiles)) {
    if (realpathSync(process.env[variable]) !== path.join(directory, name)) {
      throw new Error("Unexpected disposable fixture configuration path.");
    }
  }
  const { manifest, database } = resolveEnvironmentConfig(
    JSON.parse(readFileSync(profileFile, "utf8")),
    { runtimeEnvironment: "development", targetEnvironment: "development" }
  );
  if (
    manifest.issuer !== issuer ||
    manifest.platformOrigin !== appOrigin ||
    manifest.clientId !== "draft-fixture-client" ||
    manifest.clientSecretEnv !== "LOCAL_TO_DEVELOPMENT_CLIENT_SECRET" ||
    manifest.sessionSecretEnv !== "PLATFORM_DEVELOPMENT_SESSION_SECRET" ||
    database?.urlEnv !== "PLATFORM_DEVELOPMENT_DATABASE_URL" ||
    database.hostname !== "127.0.0.1" ||
    database.port !== 55446 ||
    database.database !== databaseName ||
    database.username !== runtime ||
    process.env.BLOG_DRAFT_E2E_ORIGIN !== appOrigin ||
    process.env.USER_CENTER_RUNTIME_ENVIRONMENT !== "development" ||
    process.env.USER_CENTER_TARGET_ENVIRONMENT !== "development" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1"
  )
    throw new Error("Unexpected disposable SDK fixture binding.");
}

function runWebServer() {
  validateFixtureEnvironment();
  const env = selectEnvironment([
    ...hostEnvironment,
    ...sharedFixtureEnvironment,
    ...appFixtureEnvironment,
  ]);
  const { BLOG_DRAFT_E2E_KEY: key, BLOG_DRAFT_E2E_CERT: cert, BLOG_DRAFT_E2E_CA_FILE: ca } = env;
  const url = new URL(env.PLATFORM_DEVELOPMENT_DATABASE_URL);
  if (
    url.protocol !== "postgresql:" ||
    url.host !== databaseHost ||
    url.pathname !== "/" + databaseName ||
    url.username !== runtime ||
    url.search ||
    url.hash ||
    env.PLATFORM_DEVELOPMENT_POSTGRES_SCHEMA !== "public" ||
    env.PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA !== readFileSync(ca, "utf8")
  )
    throw new Error("Unexpected disposable SDK runtime database.");
  for (const name of [
    "BLOG_DRAFT_E2E_DATABASE_URL",
    "DATABASE_URL",
    "DIRECT_URL",
    "POSTGRES_MIGRATION_URL",
    "POSTGRES_SHADOW_DATABASE_URL",
    "POSTGRES_BACKUP_URL",
  ]) {
    env[name] = "";
  }
  env.NODE_OPTIONS = "--import=./e2e/blog-draft-loopback.mjs";
  return (
    command(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "blog.user-center.test",
        "--port",
        "3446",
        "--experimental-https",
        "--experimental-https-key",
        key,
        "--experimental-https-cert",
        cert,
        "--experimental-https-ca",
        ca,
      ],
      { env, stdio: "inherit" }
    ).status ?? 1
  );
}

function runIssuerServer() {
  validateFixtureEnvironment();
  return (
    command(process.execPath, ["e2e/blog-draft-issuer.mjs"], {
      env: selectEnvironment([...hostEnvironment, ...sharedFixtureEnvironment]),
      stdio: "inherit",
    }).status ?? 1
  );
}

async function runTests() {
  const localDocker = mustRun(
    "docker",
    ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    "Local Docker context check"
  );
  if (
    process.env.DOCKER_HOST ||
    process.env.DOCKER_CONTEXT ||
    !/^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/.test(localDocker)
  ) {
    throw new Error("Select a local Docker context before running the draft fixture.");
  }
  mkdirSync(artifacts, { recursive: true });
  if (
    realpathSync(artifacts) !== path.join(realpathSync(root), ".feline-blog", "blog-drafts-e2e")
  ) {
    throw new Error("The fixture directory must be inside the current checkout.");
  }
  const work = realpathSync(mkdtempSync(path.join(artifacts, "fixture-")));
  const runLabel = randomUUID();
  let container;
  try {
    const fixture = prepare(work);
    const mount = (from, to) => ["--mount", `type=bind,source=${from},target=${to},readonly`];
    container = mustRun(
      "docker",
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        dockerName,
        "--label",
        label + "=" + runLabel,
        "--publish",
        databaseHost + ":5432",
        "--tmpfs",
        "/var/lib/postgresql/data",
        "--env-file",
        fixture.postgres,
        ...mount(fixture.key, "/mnt/server.key"),
        ...mount(fixture.cert, "/mnt/server.pem"),
        ...mount(fixture.init, "/mnt/fixture.sql"),
        image,
        "bash",
        "-ec",
        [
          "install -m 0600 -o postgres /mnt/server.key /tmp/draft-server.key",
          "install -m 0644 -o postgres /mnt/server.pem /tmp/draft-server.pem",
          "install -m 0600 -o postgres /mnt/fixture.sql /docker-entrypoint-initdb.d/10-fixture.sql",
          "exec docker-entrypoint.sh postgres -c ssl=on -c ssl_key_file=/tmp/draft-server.key -c ssl_cert_file=/tmp/draft-server.pem",
        ].join(" && "),
      ],
      "Starting disposable PostgreSQL"
    );
    await waitForDatabase(container);
    await seedDatabase(fixture);
    return (
      command(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config=playwright.blog-drafts.config.ts",
          ...process.argv.slice(2),
        ],
        { env: fixture.env, stdio: "inherit" }
      ).status ?? 1
    );
  } finally {
    try {
      if (container && /^[a-f0-9]{64}$/.test(container)) {
        const actual = command("docker", [
          "inspect",
          "--format",
          '{{index .Config.Labels "' + label + '"}}',
          container,
        ]);
        if (actual.stdout?.trim() === runLabel)
          mustRun("docker", ["stop", container], "Stopping disposable PostgreSQL");
      }
    } finally {
      if (ownsFixtureDirectory(work)) rmSync(work, { recursive: true, force: true });
    }
  }
}

try {
  const mode = process.argv[2];
  process.exitCode =
    mode === "--app-server"
      ? runWebServer()
      : mode === "--issuer-server"
        ? runIssuerServer()
        : await runTests();
} catch (error) {
  console.error("Disposable draft fixture failed (" + (error.code ?? error.message) + ").");
  process.exitCode = 1;
}
