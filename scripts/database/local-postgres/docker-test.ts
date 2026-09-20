import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { repositoryRoot, targets } from "./config";
import { cleanChildEnvironment } from "./env";
import { DatabaseToolError } from "./errors";
import { withHostLock } from "./lock";
import {
  destroyOwnedComposeResources,
  ensureLedger,
  localMigrationFiles,
  reconcileDatabasePrivileges,
} from "./local";
import { runPrisma } from "./migrate";
import { fence, inventory, recoverOperation, repairSequences, streamDumpRestore } from "./refresh";
import { runCommand } from "./process";
import { assertExporterSafety } from "./staging";

let currentPhase = "startup";

function password(): string {
  return randomBytes(32).toString("base64url");
}

function url(role: string, secret: string, port: string, database: string, host = "127.0.0.1") {
  const value = new URL(`postgresql://${host}`);
  value.username = role;
  value.password = secret;
  value.port = port;
  value.pathname = `/${database}`;
  return value.toString();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  client.on("error", () => undefined);
  await client.connect();
  return client;
}

async function connectEventually(connectionString: string): Promise<Client> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await connect(connectionString);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

async function expectPg(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === code)
      return;
    throw error;
  }
  throw new Error(`Expected PostgreSQL error ${code}.`);
}

async function expectTool(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DatabaseToolError && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected database tool error ${code}.`);
}

async function refreshContainers(): Promise<string[]> {
  const result = await runCommand("docker", [
    "ps",
    "--all",
    "--filter",
    "name=feline-refresh-",
    "--format",
    "{{.Names}}",
  ]);
  return result.stdout.split(/\r?\n/u).filter(Boolean).sort();
}

async function composePort(base: string[]): Promise<string> {
  const port = (await runCommand("docker", [...base, "port", "postgres", "5432"])).stdout
    .trim()
    .split(":")
    .at(-1);
  assert(port, "The disposable PostgreSQL port was not found.");
  return port;
}

async function runHostLockWorker(): Promise<void> {
  await withHostLock("docker-test-holder", async () => {
    process.stdout.write("HOST_LOCKED\n");
    await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  });
}

async function exerciseProcessHostLock(): Promise<void> {
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", fileURLToPath(import.meta.url), "--host-lock-worker"],
    {
      cwd: repositoryRoot,
      env: cleanChildEnvironment([]),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  let output = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("The host lock worker did not acquire its lock.")),
        10_000
      );
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (!output.includes("HOST_LOCKED")) {
          reject(new Error(`The host lock worker exited with code ${code ?? 1}.`));
        }
      });
      worker.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("HOST_LOCKED")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await expectTool(
      () => withHostLock("docker-test-contender", async () => undefined),
      "OWNERSHIP_AMBIGUOUS"
    );
  } finally {
    worker.stdin.write("release\n");
    worker.stdin.end();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        worker.kill();
        resolve();
      }, 5_000);
      worker.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  await withHostLock("docker-test-after-release", async () => undefined);
}

async function runCrashWorker(): Promise<void> {
  const adminUrl = process.env.FELINE_DATABASE_TEST_ADMIN_URL;
  const sql = process.env.FELINE_DATABASE_TEST_SQL;
  if (!adminUrl) throw new Error("The crash worker database URL is missing.");
  if (sql) {
    const client = await connect(adminUrl);
    await client.query(sql);
  }
  process.exit(91);
}

async function crashAfterSql(adminUrl: string, sql?: string): Promise<void> {
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", fileURLToPath(import.meta.url), "--crash-after-sql"],
    {
      cwd: repositoryRoot,
      env: cleanChildEnvironment([], {
        FELINE_DATABASE_TEST_ADMIN_URL: adminUrl,
        FELINE_DATABASE_TEST_SQL: sql,
      }),
      stdio: "ignore",
      windowsHide: true,
    }
  );
  const exitCode = await new Promise<number>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => resolve(code ?? 1));
  });
  assert(exitCode === 91, `The crash worker exited with code ${exitCode}.`);
}

async function prepareFixtures(client: Client, withRows: boolean): Promise<void> {
  await client.query(
    "CREATE TABLE public.refresh_left (id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, right_id integer)"
  );
  await client.query(
    "CREATE TABLE public.refresh_right (id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, left_id integer)"
  );
  await client.query(
    "ALTER TABLE public.refresh_left ADD CONSTRAINT refresh_left_right_fk FOREIGN KEY (right_id) REFERENCES public.refresh_right(id) DEFERRABLE INITIALLY DEFERRED"
  );
  await client.query(
    "ALTER TABLE public.refresh_right ADD CONSTRAINT refresh_right_left_fk FOREIGN KEY (left_id) REFERENCES public.refresh_left(id) DEFERRABLE INITIALLY DEFERRED"
  );
  await client.query(
    "CREATE TABLE public.refresh_empty (id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY)"
  );
  if (withRows) {
    await client.query("BEGIN");
    await client.query("INSERT INTO public.refresh_left (id, right_id) VALUES (42, 7)");
    await client.query("INSERT INTO public.refresh_right (id, left_id) VALUES (7, 42)");
    await client.query("COMMIT");
  }
}

async function foreignKeys(client: Client) {
  return (
    await client.query<{
      table_schema: string;
      table_name: string;
      name: string;
      definition: string;
    }>(`SELECT n.nspname AS table_schema, c.relname AS table_name, con.conname AS name,
      pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND con.contype = 'f' ORDER BY c.relname, con.conname`)
  ).rows;
}

async function oid(admin: Client, database: string): Promise<number> {
  const value = (
    await admin.query<{ oid: number }>("SELECT oid FROM pg_database WHERE datname = $1", [database])
  ).rows[0]?.oid;
  assert(value, `Database ${database} has no OID.`);
  return value;
}

async function insertLedger(
  admin: Client,
  item: {
    id: string;
    candidateOid: number;
    previousOid: number;
    candidate: string;
    previous: string;
    state: string;
    project: string;
  }
): Promise<void> {
  await admin.query(
    `INSERT INTO feline_tool.refresh_operations
      (operation_id, operation, owner_token, repository_identity, worktree_path, compose_project,
       process_identity, candidate_oid, previous_oid, candidate_name, previous_name, state)
     VALUES ($1, 'refresh', 'docker-test-owner', 'feline-blog-app', $2, $3,
       'docker-test-process', $4, $5, $6, $7, $8)`,
    [
      item.id,
      repositoryRoot,
      item.project,
      item.candidateOid,
      item.previousOid,
      item.candidate,
      item.previous,
      item.state,
    ]
  );
}

async function assertRecoveryState(
  admin: Client,
  operationId: string,
  expected: "complete" | "rolled_back"
): Promise<void> {
  const result = await admin.query<{ state: string }>(
    "SELECT state FROM feline_tool.refresh_operations WHERE operation_id = $1",
    [operationId]
  );
  assert(result.rows[0]?.state === expected, `Recovery did not reach ${expected}.`);
}

async function exercisePreCommitRecovery(
  admin: Client,
  adminUrl: string,
  project: string,
  state: string,
  effects: "none" | "old-renamed" | "candidate-renamed"
): Promise<void> {
  const operationId = randomBytes(16).toString("hex");
  const candidate = `feline_blog_refresh_${operationId}`;
  const previous = `feline_blog_previous_${operationId}`;
  await admin.query(`CREATE DATABASE "${candidate}" OWNER local_admin`);
  const candidateOid = await oid(admin, candidate);
  const previousOid = await oid(admin, targets.developmentDatabase);
  await insertLedger(admin, {
    id: operationId,
    candidateOid,
    previousOid,
    candidate,
    previous,
    state,
    project,
  });
  if (effects === "none") await crashAfterSql(adminUrl);
  if (effects === "old-renamed")
    await crashAfterSql(
      adminUrl,
      `ALTER DATABASE "${targets.developmentDatabase}" RENAME TO "${previous}"`
    );
  if (effects === "candidate-renamed") {
    await admin.query(`ALTER DATABASE "${targets.developmentDatabase}" RENAME TO "${previous}"`);
    await crashAfterSql(
      adminUrl,
      `ALTER DATABASE "${candidate}" RENAME TO "${targets.developmentDatabase}"`
    );
  }
  await recoverOperation(admin, operationId);
  assert(
    (await oid(admin, targets.developmentDatabase)) === previousOid,
    `${state} recovery did not preserve the previous database.`
  );
  await assertRecoveryState(admin, operationId, "rolled_back");
}

async function exerciseCommittedRecovery(
  admin: Client,
  adminUrl: string,
  project: string,
  state: "smoke_passed" | "cleanup_intent",
  previousAlreadyDropped: boolean
): Promise<void> {
  const operationId = randomBytes(16).toString("hex");
  const candidate = `feline_blog_refresh_${operationId}`;
  const previous = `feline_blog_previous_${operationId}`;
  await admin.query(`CREATE DATABASE "${candidate}" OWNER local_admin`);
  const candidateOid = await oid(admin, candidate);
  const previousOid = await oid(admin, targets.developmentDatabase);
  await insertLedger(admin, {
    id: operationId,
    candidateOid,
    previousOid,
    candidate,
    previous,
    state,
    project,
  });
  await admin.query(`ALTER DATABASE "${targets.developmentDatabase}" RENAME TO "${previous}"`);
  await admin.query(`ALTER DATABASE "${candidate}" RENAME TO "${targets.developmentDatabase}"`);
  await crashAfterSql(adminUrl, previousAlreadyDropped ? `DROP DATABASE "${previous}"` : undefined);
  await recoverOperation(admin, operationId);
  assert(
    (await oid(admin, targets.developmentDatabase)) === candidateOid,
    `${state} recovery did not preserve the committed candidate.`
  );
  await assertRecoveryState(admin, operationId, "complete");
}

async function main(): Promise<void> {
  const id = randomBytes(8).toString("hex");
  const project = `feline-blog-test-${id}`;
  const volume = `${project}-data`;
  const directory = await mkdtemp(path.join(os.tmpdir(), "feline-blog-postgres-test-"));
  const composeFile = path.join(directory, "compose.yaml");
  const adminPassword = password();
  const migratorPassword = password();
  const runtimePassword = password();
  await writeFile(
    composeFile,
    `services:
  postgres:
    image: ${targets.postgresImage}
    environment:
      POSTGRES_USER: local_admin
      POSTGRES_PASSWORD: ${adminPassword}
      POSTGRES_DB: postgres
    ports:
      - "127.0.0.1::5432"
    volumes:
      - ${volume}:/var/lib/postgresql/data
    labels:
      com.feline-blog.owner: feline-blog-test
      com.feline-blog.test-id: ${id}
      com.feline-blog.compose-project: ${project}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U local_admin -d postgres"]
      interval: 1s
      timeout: 2s
      retries: 30
volumes:
  ${volume}:
    name: ${volume}
    labels:
      com.feline-blog.owner: feline-blog-test
      com.feline-blog.test-id: ${id}
      com.feline-blog.compose-project: ${project}
`,
    { encoding: "utf8", mode: 0o600 }
  );
  const base = ["compose", "--project-name", project, "--file", composeFile];
  try {
    currentPhase = "process-host-lock";
    await exerciseProcessHostLock();
    await runCommand("docker", [...base, "up", "--detach", "--wait"], { cwd: repositoryRoot });
    let port = await composePort(base);
    const container = (await runCommand("docker", [...base, "ps", "-q", "postgres"])).stdout.trim();
    const binding = await runCommand("docker", [
      "inspect",
      container,
      "--format",
      "{{json .NetworkSettings.Ports}}",
    ]);
    assert(binding.stdout.includes("127.0.0.1"), "PostgreSQL is not bound to loopback only.");

    currentPhase = "bootstrap";
    let adminUrl = url(targets.adminRole, adminPassword, port, targets.maintenanceDatabase);
    let admin = await connect(adminUrl);
    await admin.query(
      `CREATE ROLE app_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${migratorPassword}'`
    );
    await admin.query(
      `CREATE ROLE app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${runtimePassword}'`
    );
    for (const database of [
      targets.developmentDatabase,
      targets.shadowDatabase,
      targets.verifyDatabase,
    ]) {
      await admin.query(`CREATE DATABASE "${database}" OWNER local_admin`);
      await admin.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC`);
      await admin.query(
        `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE "${database}" TO app_migrator`
      );
    }
    await admin.query(`GRANT CONNECT ON DATABASE "${targets.developmentDatabase}" TO app_runtime`);
    await ensureLedger(admin);
    await admin.end();

    for (const database of [
      targets.developmentDatabase,
      targets.shadowDatabase,
      targets.verifyDatabase,
    ]) {
      await reconcileDatabasePrivileges(adminUrl, database);
    }
    currentPhase = "migrations";
    for (const database of [targets.developmentDatabase, targets.verifyDatabase]) {
      await runPrisma(
        ["migrate", "deploy"],
        cleanChildEnvironment([], {
          POSTGRES_MIGRATION_URL: url(targets.migratorRole, migratorPassword, port, database),
        })
      );
    }

    currentPhase = "privileges";
    const runtimeUrl = url(targets.runtimeRole, runtimePassword, port, targets.developmentDatabase);
    const runtime = await connect(runtimeUrl);
    await runtime.query("BEGIN");
    const probeId = randomUUID();
    await runtime.query(
      `INSERT INTO public."_app_postgres_connection_probe" (id, nonce, value, "updatedAt") VALUES ($1, $2, 'runtime', now())`,
      [probeId, probeId]
    );
    await runtime.query(
      `UPDATE public."_app_postgres_connection_probe" SET value = 'checked' WHERE id = $1`,
      [probeId]
    );
    await runtime.query(`DELETE FROM public."_app_postgres_connection_probe" WHERE id = $1`, [
      probeId,
    ]);
    await runtime.query("ROLLBACK");
    await expectPg(() => runtime.query("CREATE SCHEMA forbidden_runtime"), "42501");
    await expectPg(() => runtime.query("CREATE ROLE forbidden_runtime"), "42501");
    await expectPg(() => runtime.query("CREATE DATABASE forbidden_runtime"), "42501");
    await runtime.end();
    for (const database of [targets.shadowDatabase, targets.verifyDatabase]) {
      await expectPg(
        async () =>
          (await connect(url(targets.runtimeRole, runtimePassword, port, database))).end(),
        "42501"
      );
    }

    const migrator = await connect(
      url(targets.migratorRole, migratorPassword, port, targets.developmentDatabase)
    );
    await migrator.query("CREATE TABLE public.default_grant_probe (id integer PRIMARY KEY)");
    const ownership = await migrator.query<{ owner: string; runtime_dml: boolean }>(`SELECT
      pg_get_userbyid(c.relowner) AS owner,
      has_table_privilege('app_runtime', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS runtime_dml
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'default_grant_probe'`);
    assert(ownership.rows[0]?.owner === targets.migratorRole, "Migrator ownership is wrong.");
    assert(ownership.rows[0]?.runtime_dml, "Runtime default grants are missing.");
    await migrator.query("DROP TABLE public.default_grant_probe");
    await expectPg(() => migrator.query("CREATE ROLE forbidden_migrator"), "42501");
    await expectPg(() => migrator.query("CREATE DATABASE forbidden_migrator"), "42501");
    await migrator.end();

    currentPhase = "snapshot-restore";
    const source = await connect(
      url(targets.adminRole, adminPassword, port, targets.developmentDatabase)
    );
    const target = await connect(
      url(targets.adminRole, adminPassword, port, targets.verifyDatabase)
    );
    const writer = await connect(
      url(targets.adminRole, adminPassword, port, targets.developmentDatabase)
    );
    await prepareFixtures(source, true);
    await prepareFixtures(target, false);
    await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (
      await source.query<{ snapshot: string }>("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0]?.snapshot;
    assert(snapshot, "PostgreSQL did not export a snapshot.");
    const manifest = await inventory(source);
    const raceNonce = `snapshot-${id}`;
    await writer.query(
      `INSERT INTO public."_app_postgres_connection_probe" (id, nonce, value, "updatedAt") VALUES (gen_random_uuid(), $1, 'race', now())`,
      [raceNonce]
    );
    const keys = await foreignKeys(target);
    for (const key of keys) {
      await target.query(
        `ALTER TABLE "${key.table_schema}"."${key.table_name}" DROP CONSTRAINT "${key.name}"`
      );
    }
    await streamDumpRestore({
      sourceUrl: url(
        targets.adminRole,
        adminPassword,
        port,
        targets.developmentDatabase,
        "host.docker.internal"
      ),
      targetUrl: url(targets.adminRole, adminPassword, port, targets.verifyDatabase),
      certificate: "",
      snapshot,
      tables: manifest,
      sourceTls: false,
    });
    await source.query("ROLLBACK");
    for (const key of keys) {
      await target.query(
        `ALTER TABLE "${key.table_schema}"."${key.table_name}" ADD CONSTRAINT "${key.name}" ${key.definition}`
      );
    }
    await repairSequences(target, manifest);
    assert(
      JSON.stringify(await inventory(target)) === JSON.stringify(manifest),
      "Restored counts differ from the snapshot manifest."
    );
    const sequences = await target.query<{ advanced: string; empty: string }>(
      "SELECT nextval('public.refresh_left_id_seq')::text AS advanced, nextval('public.refresh_empty_id_seq')::text AS empty"
    );
    assert(sequences.rows[0]?.advanced === "43", "Advanced sequence repair failed.");
    assert(sequences.rows[0]?.empty === "1", "Empty sequence repair failed.");
    const race = await target.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public."_app_postgres_connection_probe" WHERE nonce = $1`,
      [raceNonce]
    );
    assert(race.rows[0]?.count === "0", "Restore escaped the exported snapshot.");
    await writer.query(`DELETE FROM public."_app_postgres_connection_probe" WHERE nonce = $1`, [
      raceNonce,
    ]);

    currentPhase = "restore-failure-cleanup";
    await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const failureSnapshot = (
      await source.query<{ snapshot: string }>("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0]?.snapshot;
    assert(failureSnapshot, "PostgreSQL did not export a failure-test snapshot.");
    const containersBeforeFailure = await refreshContainers();
    await expectTool(
      () =>
        streamDumpRestore({
          sourceUrl: url(
            targets.adminRole,
            adminPassword,
            port,
            targets.developmentDatabase,
            "host.docker.internal"
          ),
          targetUrl: url(targets.adminRole, adminPassword, port, "missing_restore_target"),
          certificate: "",
          snapshot: failureSnapshot,
          tables: manifest,
          sourceTls: false,
          timeoutMs: 30_000,
        }),
      "RESTORE_FAILED"
    );
    await source.query("ROLLBACK");
    assert(
      JSON.stringify(await refreshContainers()) === JSON.stringify(containersBeforeFailure),
      "Failed restore left disposable child containers behind."
    );

    currentPhase = "dump-failure-cleanup";
    await expectTool(
      () =>
        streamDumpRestore({
          sourceUrl: url(
            targets.adminRole,
            adminPassword,
            port,
            "missing_dump_source",
            "host.docker.internal"
          ),
          targetUrl: url(targets.adminRole, adminPassword, port, targets.verifyDatabase),
          certificate: "",
          snapshot: "missing-snapshot",
          tables: manifest,
          sourceTls: false,
          timeoutMs: 30_000,
        }),
      "SNAPSHOT_FAILED"
    );
    assert(
      JSON.stringify(await refreshContainers()) === JSON.stringify(containersBeforeFailure),
      "Failed dump left disposable child containers behind."
    );
    await Promise.all([source.end(), target.end(), writer.end()]);

    currentPhase = "unsupported-objects";
    const unsupported = await connect(
      url(targets.adminRole, adminPassword, port, targets.developmentDatabase)
    );
    await unsupported.query(
      "CREATE TABLE public.unsupported_partition (id integer) PARTITION BY RANGE (id)"
    );
    await expectTool(() => inventory(unsupported), "SNAPSHOT_FAILED");
    await unsupported.query("DROP TABLE public.unsupported_partition");

    await unsupported.query("CREATE EXTENSION file_fdw");
    await unsupported.query("CREATE SERVER unsupported_file FOREIGN DATA WRAPPER file_fdw");
    await unsupported.query(
      "CREATE FOREIGN TABLE public.unsupported_foreign (value text) SERVER unsupported_file OPTIONS (filename '/dev/null')"
    );
    await expectTool(() => inventory(unsupported), "SNAPSHOT_FAILED");
    await unsupported.query("DROP FOREIGN TABLE public.unsupported_foreign");
    await unsupported.query("DROP SERVER unsupported_file");
    await unsupported.query("DROP EXTENSION file_fdw");

    await unsupported.query(
      "CREATE MATERIALIZED VIEW public.unsupported_materialized AS SELECT 1 AS value"
    );
    await expectTool(() => inventory(unsupported), "SNAPSHOT_FAILED");
    await unsupported.query("DROP MATERIALIZED VIEW public.unsupported_materialized");

    await unsupported.query("CREATE TABLE public.unsupported_rls (value integer)");
    await unsupported.query("ALTER TABLE public.unsupported_rls ENABLE ROW LEVEL SECURITY");
    await expectTool(() => inventory(unsupported), "SNAPSHOT_FAILED");
    await unsupported.query("DROP TABLE public.unsupported_rls");

    await unsupported.query(
      "CREATE FUNCTION public.unsupported_trigger_function() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$"
    );
    await unsupported.query("CREATE TABLE public.unsupported_trigger_table (value integer)");
    await unsupported.query(
      "CREATE TRIGGER unsupported_trigger BEFORE INSERT ON public.unsupported_trigger_table FOR EACH ROW EXECUTE FUNCTION public.unsupported_trigger_function()"
    );
    await expectTool(() => inventory(unsupported), "SNAPSHOT_FAILED");
    await unsupported.query("DROP TABLE public.unsupported_trigger_table");
    await unsupported.query("DROP FUNCTION public.unsupported_trigger_function()");

    const largeObject = (await unsupported.query<{ oid: number }>("SELECT lo_create(0) AS oid"))
      .rows[0]?.oid;
    assert(largeObject, "The large object fixture was not created.");
    await expectTool(() => inventory(unsupported), "SNAPSHOT_FAILED");
    await unsupported.query("SELECT lo_unlink($1)", [largeObject]);

    const exporterPassword = password();
    await unsupported.query(
      "CREATE FUNCTION public.unsupported_exporter_function() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$"
    );
    await unsupported.query(
      `CREATE ROLE app_exporter LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${exporterPassword}'`
    );
    await unsupported.query(
      `GRANT CONNECT ON DATABASE "${targets.developmentDatabase}" TO app_exporter`
    );
    const exporter = await connect(
      url("app_exporter", exporterPassword, port, targets.developmentDatabase)
    );
    await expectTool(() => assertExporterSafety(exporter), "ROLE_MISMATCH");
    await exporter.end();
    await unsupported.query("DROP FUNCTION public.unsupported_exporter_function()");
    await unsupported.end();

    currentPhase = "connection-fence";
    admin = await connect(adminUrl);
    const activeId = "a".repeat(32);
    await admin.query(
      `INSERT INTO feline_tool.refresh_operations
       (operation_id, operation, owner_token, repository_identity, worktree_path, compose_project, process_identity, state)
       VALUES ($1, 'refresh', 'owner', 'feline-blog-app', $2, $3, 'process', 'validated')`,
      [activeId, repositoryRoot, project]
    );
    const idleRuntime = await connect(runtimeUrl);
    await expectTool(
      () => fence(admin, activeId, [targets.developmentDatabase]),
      "ACTIVE_CONNECTIONS"
    );
    await idleRuntime.query("SELECT 1");
    await idleRuntime.end();
    await admin.query(
      `GRANT CONNECT ON DATABASE "${targets.developmentDatabase}" TO app_runtime, app_migrator`
    );
    await admin.query("DELETE FROM feline_tool.refresh_operations WHERE operation_id = $1", [
      activeId,
    ]);

    const reconnectId = "b".repeat(32);
    await admin.query(
      `INSERT INTO feline_tool.refresh_operations
       (operation_id, operation, owner_token, repository_identity, worktree_path, compose_project, process_identity, state)
       VALUES ($1, 'refresh', 'owner', 'feline-blog-app', $2, $3, 'process', 'validated')`,
      [reconnectId, repositoryRoot, project]
    );
    const reconnect = new Promise<string>((resolve) => {
      setTimeout(() => {
        void connect(runtimeUrl).then(
          async (client) => {
            await client.end();
            resolve("connected");
          },
          (error: unknown) =>
            resolve(
              typeof error === "object" && error && "code" in error ? String(error.code) : "unknown"
            )
        );
      }, 50);
    });
    await fence(admin, reconnectId, [targets.developmentDatabase]);
    assert((await reconnect) === "42501", "A runtime connection entered after the fence.");
    await admin.query(
      `GRANT CONNECT ON DATABASE "${targets.developmentDatabase}" TO app_runtime, app_migrator`
    );
    await admin.query("DELETE FROM feline_tool.refresh_operations WHERE operation_id = $1", [
      reconnectId,
    ]);

    currentPhase = "advisory-lock";
    const otherAdmin = await connect(adminUrl);
    await admin.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      `${targets.composeProject}:database-operation`,
    ]);
    const competing = await otherAdmin.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [`${targets.composeProject}:database-operation`]
    );
    assert(!competing.rows[0]?.locked, "The advisory lock did not serialize operations.");
    await admin.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
      `${targets.composeProject}:database-operation`,
    ]);
    await otherAdmin.end();

    currentPhase = "rename-transaction";
    const transactionDatabase = `feline_blog_tx_${id}`;
    await admin.query(`CREATE DATABASE "${transactionDatabase}" OWNER local_admin`);
    const transactionDatabaseOid = await oid(admin, transactionDatabase);
    let renameTransactionRestricted = false;
    await admin.query("BEGIN");
    try {
      await admin.query(
        `ALTER DATABASE "${transactionDatabase}" RENAME TO "${transactionDatabase}_x"`
      );
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "25001"
      ) {
        throw error;
      }
      renameTransactionRestricted = true;
    }
    await admin.query("ROLLBACK");
    assert(
      (await oid(admin, transactionDatabase)) === transactionDatabaseOid,
      "Rename rollback did not preserve the database OID."
    );
    await admin.query(`DROP DATABASE "${transactionDatabase}"`);

    currentPhase = "persistence";
    const persistNonce = `persist-${id}`;
    const persistence = await connect(
      url(targets.adminRole, adminPassword, port, targets.developmentDatabase)
    );
    await persistence.query(
      `INSERT INTO public."_app_postgres_connection_probe" (id, nonce, value, "updatedAt") VALUES (gen_random_uuid(), $1, 'persisted', now())`,
      [persistNonce]
    );
    await persistence.end();
    await admin.end();
    await runCommand("docker", ["restart", container], { cwd: repositoryRoot });
    await runCommand("docker", [...base, "up", "--detach", "--wait"], { cwd: repositoryRoot });
    port = await composePort(base);
    adminUrl = url(targets.adminRole, adminPassword, port, targets.maintenanceDatabase);
    admin = await connectEventually(adminUrl);
    const persisted = await connectEventually(
      url(targets.adminRole, adminPassword, port, targets.developmentDatabase)
    );
    const persistedCount = await persisted.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public."_app_postgres_connection_probe" WHERE nonce = $1`,
      [persistNonce]
    );
    assert(persistedCount.rows[0]?.count === "1", "Compose down did not preserve data.");
    await persisted.query(`DELETE FROM public."_app_postgres_connection_probe" WHERE nonce = $1`, [
      persistNonce,
    ]);
    await persisted.end();

    currentPhase = "recovery-window-matrix";
    await exercisePreCommitRecovery(admin, adminUrl, project, "old_rename_intent", "none");
    await exercisePreCommitRecovery(admin, adminUrl, project, "old_rename_intent", "old-renamed");
    await exercisePreCommitRecovery(admin, adminUrl, project, "old_renamed", "old-renamed");
    await exercisePreCommitRecovery(
      admin,
      adminUrl,
      project,
      "candidate_rename_intent",
      "old-renamed"
    );
    await exercisePreCommitRecovery(
      admin,
      adminUrl,
      project,
      "candidate_rename_intent",
      "candidate-renamed"
    );
    await exercisePreCommitRecovery(
      admin,
      adminUrl,
      project,
      "candidate_renamed",
      "candidate-renamed"
    );
    await exerciseCommittedRecovery(admin, adminUrl, project, "smoke_passed", false);
    await exerciseCommittedRecovery(admin, adminUrl, project, "cleanup_intent", true);

    currentPhase = "pre-commit-recovery";
    const rollbackId = "c".repeat(32);
    const rollbackCandidate = `feline_blog_refresh_${rollbackId}`;
    const rollbackPrevious = `feline_blog_previous_${rollbackId}`;
    await admin.query(`CREATE DATABASE "${rollbackCandidate}" OWNER local_admin`);
    const rollbackCandidateOid = await oid(admin, rollbackCandidate);
    const rollbackPreviousOid = await oid(admin, targets.developmentDatabase);
    await insertLedger(admin, {
      id: rollbackId,
      candidateOid: rollbackCandidateOid,
      previousOid: rollbackPreviousOid,
      candidate: rollbackCandidate,
      previous: rollbackPrevious,
      state: "candidate_renamed",
      project,
    });
    await admin.query(
      `ALTER DATABASE "${targets.developmentDatabase}" RENAME TO "${rollbackPrevious}"`
    );
    await admin.query(
      `ALTER DATABASE "${rollbackCandidate}" RENAME TO "${targets.developmentDatabase}"`
    );
    await recoverOperation(admin, rollbackId);
    assert(
      (await oid(admin, targets.developmentDatabase)) === rollbackPreviousOid,
      "Rollback lost the original database."
    );
    const rollbackState = await admin.query<{ state: string }>(
      "SELECT state FROM feline_tool.refresh_operations WHERE operation_id = $1",
      [rollbackId]
    );
    assert(rollbackState.rows[0]?.state === "rolled_back", "Rollback state was not durable.");

    currentPhase = "post-commit-recovery";
    const commitId = "d".repeat(32);
    const commitCandidate = `feline_blog_refresh_${commitId}`;
    const commitPrevious = `feline_blog_previous_${commitId}`;
    await admin.query(`CREATE DATABASE "${commitCandidate}" OWNER local_admin`);
    const markerClient = await connect(
      url(targets.adminRole, adminPassword, port, commitCandidate)
    );
    await markerClient.query("CREATE TABLE public.committed_marker (value text NOT NULL)");
    await markerClient.query("INSERT INTO public.committed_marker VALUES ('viable')");
    await markerClient.end();
    const commitCandidateOid = await oid(admin, commitCandidate);
    const commitPreviousOid = await oid(admin, targets.developmentDatabase);
    await insertLedger(admin, {
      id: commitId,
      candidateOid: commitCandidateOid,
      previousOid: commitPreviousOid,
      candidate: commitCandidate,
      previous: commitPrevious,
      state: "committed",
      project,
    });
    await admin.query(
      `ALTER DATABASE "${targets.developmentDatabase}" RENAME TO "${commitPrevious}"`
    );
    await admin.query(
      `ALTER DATABASE "${commitCandidate}" RENAME TO "${targets.developmentDatabase}"`
    );
    const previousConnection = await connect(
      url(targets.adminRole, adminPassword, port, commitPrevious)
    );
    await recoverOperation(admin, commitId);
    const pending = await admin.query<{ state: string }>(
      "SELECT state FROM feline_tool.refresh_operations WHERE operation_id = $1",
      [commitId]
    );
    assert(pending.rows[0]?.state === "cleanup_pending", "Active cleanup was not deferred.");
    assert(
      (await oid(admin, targets.developmentDatabase)) === commitCandidateOid,
      "Commit changed canonical OID."
    );
    await previousConnection.end();
    await recoverOperation(admin, commitId);
    const complete = await admin.query<{ state: string }>(
      "SELECT state FROM feline_tool.refresh_operations WHERE operation_id = $1",
      [commitId]
    );
    assert(complete.rows[0]?.state === "complete", "Committed cleanup did not complete.");
    const canonical = await connect(
      url(targets.adminRole, adminPassword, port, targets.developmentDatabase)
    );
    const marker = await canonical.query<{ value: string }>(
      "SELECT value FROM public.committed_marker"
    );
    assert(marker.rows[0]?.value === "viable", "Recovery discarded the viable database.");
    await canonical.end();
    await admin.end();

    currentPhase = "owned-destroy";
    const originalDockerHost = process.env.DOCKER_HOST;
    process.env.DOCKER_HOST = "tcp://remote.invalid:2376";
    try {
      await expectTool(
        () =>
          destroyOwnedComposeResources({
            composeArguments: base,
            composeProject: project,
            composeService: "postgres",
            composeVolume: volume,
            owner: "feline-blog-test",
          }),
        "TARGET_REJECTED"
      );
    } finally {
      if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = originalDockerHost;
    }
    await expectTool(
      () =>
        destroyOwnedComposeResources({
          composeArguments: base,
          composeProject: project,
          composeService: "postgres",
          composeVolume: volume,
          owner: "wrong-owner",
        }),
      "OWNERSHIP_AMBIGUOUS"
    );

    const unsafeProject = `${project}-unsafe`;
    const unsafeVolume = `${unsafeProject}-data`;
    const unsafeExtraVolume = `${unsafeProject}-extra`;
    const unsafeComposeFile = path.join(directory, "unsafe-compose.yaml");
    await writeFile(
      unsafeComposeFile,
      `services:
  postgres:
    image: ${targets.postgresImage}
    command: ["sleep", "60"]
    volumes:
      - ${unsafeVolume}:/var/lib/postgresql/data
      - ${unsafeExtraVolume}:/unexpected
    labels:
      com.feline-blog.owner: feline-blog-test
      com.feline-blog.compose-project: ${unsafeProject}
volumes:
  ${unsafeVolume}:
    name: ${unsafeVolume}
    labels:
      com.feline-blog.owner: feline-blog-test
      com.feline-blog.compose-project: ${unsafeProject}
  ${unsafeExtraVolume}:
    name: ${unsafeExtraVolume}
`,
      { encoding: "utf8", mode: 0o600 }
    );
    const unsafeBase = ["compose", "--project-name", unsafeProject, "--file", unsafeComposeFile];
    await runCommand("docker", [...unsafeBase, "up", "--detach"], { cwd: repositoryRoot });
    try {
      await expectTool(
        () =>
          destroyOwnedComposeResources({
            composeArguments: unsafeBase,
            composeProject: unsafeProject,
            composeService: "postgres",
            composeVolume: unsafeVolume,
            owner: "feline-blog-test",
          }),
        "OWNERSHIP_AMBIGUOUS"
      );
    } finally {
      await runCommand("docker", [...unsafeBase, "down", "--volumes"], {
        cwd: repositoryRoot,
      });
    }

    await destroyOwnedComposeResources({
      composeArguments: base,
      composeProject: project,
      composeService: "postgres",
      composeVolume: volume,
      owner: "feline-blog-test",
    });
    const remainingVolume = await runCommand("docker", [
      "volume",
      "ls",
      "--filter",
      `name=^${volume}$`,
      "--format",
      "{{.Name}}",
    ]);
    assert(!remainingVolume.stdout.trim(), "Owned destroy left the disposable volume behind.");

    console.log(
      JSON.stringify({
        ok: true,
        project,
        migrationsReplayed: (await localMigrationFiles()).length,
        snapshotConsistent: true,
        restoreValidated: true,
        privilegesIsolated: true,
        fenceValidated: true,
        recoveryValidated: true,
        persistenceValidated: true,
        hostLockValidated: true,
        producerCleanupValidated: true,
        unsupportedObjectsValidated: true,
        recoveryWindowsValidated: true,
        destroyValidated: true,
        renameTransactionRestricted,
      })
    );
  } finally {
    await runCommand("docker", [...base, "down", "--volumes", "--remove-orphans"], {
      cwd: repositoryRoot,
    }).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

const run = process.argv.includes("--host-lock-worker")
  ? runHostLockWorker
  : process.argv.includes("--crash-after-sql")
    ? runCrashWorker
    : main;

run().catch((error: unknown) => {
  const causeCode =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "ASSERTION_FAILED";
  const causePhase = error instanceof DatabaseToolError ? error.phase : undefined;
  console.error(
    JSON.stringify({
      ok: false,
      code: "RESTORE_FAILED",
      summary: "The disposable Docker database test failed.",
      phase: currentPhase,
      causeCode,
      ...(causePhase ? { causePhase } : {}),
    })
  );
  process.exitCode = 1;
});
