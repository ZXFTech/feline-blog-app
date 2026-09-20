import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { composeEnvironmentFile, composeFile, repositoryRoot, targets } from "./config";
import { DatabaseToolError } from "./errors";
import {
  ensureLocalConfiguration,
  readEnvironmentFile,
  requireValue,
  type EnvironmentValues,
} from "./env";
import { withHostLock } from "./lock";
import { runCommand } from "./process";
import { classifyLocalTarget, migrationChecksum, type RedactedTarget } from "./target";

const composeBaseArguments = [
  "compose",
  "--project-name",
  targets.composeProject,
  "--file",
  composeFile,
  "--env-file",
  composeEnvironmentFile,
];

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function localFiles(): Promise<{
  development: EnvironmentValues;
  shadow: EnvironmentValues;
}> {
  const development = await readEnvironmentFile(".env.development");
  const shadow = await readEnvironmentFile(".env.shadow");
  classifyLocalTarget(
    requireValue(development, "POSTGRES_DATABASE_URL"),
    targets.developmentDatabase,
    targets.runtimeRole,
    development.POSTGRES_ENVIRONMENT
  );
  classifyLocalTarget(
    requireValue(development, "POSTGRES_MIGRATION_URL"),
    targets.developmentDatabase,
    targets.migratorRole,
    development.POSTGRES_ENVIRONMENT
  );
  classifyLocalTarget(
    requireValue(shadow, "POSTGRES_SHADOW_DATABASE_URL"),
    targets.shadowDatabase,
    targets.migratorRole,
    shadow.POSTGRES_ENVIRONMENT
  );
  classifyLocalTarget(
    requireValue(shadow, "POSTGRES_VERIFY_DATABASE_URL"),
    targets.verifyDatabase,
    targets.migratorRole,
    shadow.POSTGRES_ENVIRONMENT
  );
  classifyLocalTarget(
    requireValue(shadow, "POSTGRES_ADMIN_URL"),
    targets.maintenanceDatabase,
    targets.adminRole,
    shadow.POSTGRES_ENVIRONMENT
  );
  if (shadow.POSTGRES_COMPOSE_PROJECT !== targets.composeProject) {
    throw new DatabaseToolError("TARGET_REJECTED", "The Compose project is not allowlisted.");
  }
  return { development, shadow };
}

async function connect(connectionString: string, database?: string): Promise<Client> {
  const url = new URL(connectionString);
  if (database) url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
  await client.connect();
  return client;
}

async function withDatabaseLock<T>(
  adminUrl: string,
  action: (client: Client) => Promise<T>
): Promise<T> {
  const client = await connect(adminUrl);
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [`${targets.composeProject}:database-operation`]
    );
    if (!result.rows[0]?.locked) {
      throw new DatabaseToolError("RECOVERY_REQUIRED", "Another database operation is active.");
    }
    await ensureLedger(client);
    const incomplete = await client.query<{ operation_id: string }>(
      "SELECT operation_id FROM feline_tool.refresh_operations WHERE state NOT IN ('complete', 'rolled_back') ORDER BY started_at DESC LIMIT 1"
    );
    if (incomplete.rowCount) {
      throw new DatabaseToolError(
        "RECOVERY_REQUIRED",
        `Refresh operation ${incomplete.rows[0]?.operation_id} requires recovery.`
      );
    }
    return await action(client);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
        `${targets.composeProject}:database-operation`,
      ])
      .catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function ensureLedger(client: Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS feline_tool AUTHORIZATION local_admin");
  await client.query(`
    CREATE TABLE IF NOT EXISTS feline_tool.refresh_operations (
      operation_id text PRIMARY KEY,
      operation text NOT NULL,
      owner_token text NOT NULL,
      repository_identity text NOT NULL,
      worktree_path text NOT NULL,
      compose_project text NOT NULL,
      process_identity text NOT NULL,
      candidate_oid oid,
      previous_oid oid,
      candidate_name text,
      previous_name text,
      fence_state text,
      state text NOT NULL,
      intent jsonb,
      result jsonb,
      child_processes jsonb NOT NULL DEFAULT '[]'::jsonb,
      docker_containers jsonb NOT NULL DEFAULT '[]'::jsonb,
      started_at timestamptz NOT NULL DEFAULT now(),
      heartbeat timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query("REVOKE ALL ON SCHEMA feline_tool FROM PUBLIC");
  await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA feline_tool FROM PUBLIC");
}

export async function localUp(): Promise<void> {
  await withHostLock("local-up", async () => {
    await ensureLocalConfiguration();
    await runCommand("docker", ["info", "--format", "{{.ServerVersion}}"], {
      code: "DOCKER_UNAVAILABLE",
      phase: "docker-check",
    });
    await runCommand(
      "docker",
      [...composeBaseArguments, "up", "--detach", "--wait", targets.composeService],
      {
        cwd: repositoryRoot,
        code: "DOCKER_UNAVAILABLE",
        phase: "compose-up",
      }
    );
  });
}

async function ensureRole(
  client: Client,
  role: string,
  password: string,
  attributes: string
): Promise<void> {
  const current = await client.query<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolinherit: boolean;
  }>("SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit FROM pg_roles WHERE rolname = $1", [
    role,
  ]);
  if (current.rowCount) {
    const value = current.rows[0];
    if (value?.rolsuper || value?.rolcreatedb || value?.rolcreaterole || value?.rolinherit) {
      throw new DatabaseToolError("ROLE_MISMATCH", `${role} has stronger attributes than allowed.`);
    }
    await client.query(
      `ALTER ROLE ${quoteIdentifier(role)} ${attributes} PASSWORD ${quoteLiteral(password)}`
    );
  } else {
    await client.query(
      `CREATE ROLE ${quoteIdentifier(role)} ${attributes} PASSWORD ${quoteLiteral(password)}`
    );
  }
  const memberships = await client.query(
    "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1",
    [role]
  );
  if (memberships.rowCount) {
    throw new DatabaseToolError("ROLE_MISMATCH", `${role} has unexpected role membership.`);
  }
}

async function ensureDatabase(client: Client, database: string): Promise<void> {
  const result = await client.query<{ owner: string }>(
    "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1",
    [database]
  );
  if (!result.rowCount) {
    await client.query(
      `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(targets.adminRole)}`
    );
  } else if (result.rows[0]?.owner !== targets.adminRole) {
    throw new DatabaseToolError("OWNERSHIP_AMBIGUOUS", `${database} has an unexpected owner.`);
  }
  await client.query(`REVOKE CONNECT ON DATABASE ${quoteIdentifier(database)} FROM PUBLIC`);
  await client.query(
    `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(targets.migratorRole)}`
  );
  if (database === targets.developmentDatabase) {
    await client.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(targets.runtimeRole)}`
    );
  } else {
    await client.query(
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(database)} FROM ${quoteIdentifier(targets.runtimeRole)}`
    );
  }
}

async function reconcileDatabasePrivileges(adminUrl: string, database: string): Promise<void> {
  const client = await connect(adminUrl, database);
  try {
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS public AUTHORIZATION ${quoteIdentifier(targets.migratorRole)}`
    );
    await client.query(`ALTER SCHEMA public OWNER TO ${quoteIdentifier(targets.migratorRole)}`);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC");
    if (database === targets.developmentDatabase) {
      await client.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(targets.runtimeRole)}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(targets.runtimeRole)}`
      );
      await client.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(targets.runtimeRole)}`
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(targets.migratorRole)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdentifier(targets.runtimeRole)}`
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(targets.migratorRole)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quoteIdentifier(targets.runtimeRole)}`
      );
    }
  } finally {
    await client.end();
  }
}

export async function localSetup(): Promise<void> {
  await withHostLock("local-setup", async () => {
    const credentials = await ensureLocalConfiguration();
    const { shadow } = await localFiles();
    const adminUrl = requireValue(shadow, "POSTGRES_ADMIN_URL");
    await withDatabaseLock(adminUrl, async (admin) => {
      await ensureRole(
        admin,
        targets.migratorRole,
        credentials.POSTGRES_MIGRATOR_PASSWORD,
        "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
      );
      await ensureRole(
        admin,
        targets.runtimeRole,
        credentials.POSTGRES_RUNTIME_PASSWORD,
        "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
      );
      for (const database of [
        targets.developmentDatabase,
        targets.shadowDatabase,
        targets.verifyDatabase,
      ]) {
        await ensureDatabase(admin, database);
      }
      for (const database of [
        targets.developmentDatabase,
        targets.shadowDatabase,
        targets.verifyDatabase,
      ]) {
        await reconcileDatabasePrivileges(adminUrl, database);
      }
    });
  });
}

async function localMigrationFiles(): Promise<Array<{ name: string; checksum: string }>> {
  const root = path.join(repositoryRoot, "prisma", "postgres", "migrations");
  const entries = await readdir(root, { withFileTypes: true });
  const migrations: Array<{ name: string; checksum: string }> = [];
  for (const entry of entries
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const contents = await readFile(path.join(root, entry.name, "migration.sql"));
    migrations.push({ name: entry.name, checksum: migrationChecksum(contents) });
  }
  return migrations;
}

async function dockerState(): Promise<{ containerState: string; dockerHealth: string }> {
  try {
    const result = await runCommand("docker", [...composeBaseArguments, "ps", "--format", "json"], {
      cwd: repositoryRoot,
      code: "DOCKER_UNAVAILABLE",
      phase: "compose-status",
    });
    const line = result.stdout.trim().split(/\r?\n/).filter(Boolean)[0];
    if (!line) return { containerState: "absent", dockerHealth: "unknown" };
    const parsed = JSON.parse(line) as { State?: string; Health?: string };
    return {
      containerState: parsed.State || "unknown",
      dockerHealth: parsed.Health || "unknown",
    };
  } catch {
    return { containerState: "unknown", dockerHealth: "unknown" };
  }
}

export interface LocalStatus extends RedactedTarget {
  environment: "local";
  dockerContextClass: string;
  containerState: string;
  dockerHealth: string;
  sqlReady: boolean;
  effectiveCapabilities: Record<string, boolean> | "unknown";
  migrationState: string;
  migrationNames: string[];
  migrationChecksums: Record<string, string>;
  operationState: string;
  recoveryRequired: boolean;
}

export async function localStatus(): Promise<LocalStatus> {
  const { development, shadow } = await localFiles();
  const target = classifyLocalTarget(
    requireValue(development, "POSTGRES_DATABASE_URL"),
    targets.developmentDatabase,
    targets.runtimeRole,
    development.POSTGRES_ENVIRONMENT
  );
  const docker = await dockerState();
  const migrationFiles = await localMigrationFiles();
  const base: LocalStatus = {
    environment: "local",
    ...target,
    dockerContextClass: "unknown",
    ...docker,
    sqlReady: false,
    effectiveCapabilities: "unknown",
    migrationState: "unknown",
    migrationNames: migrationFiles.map((item) => item.name),
    migrationChecksums: Object.fromEntries(
      migrationFiles.map((item) => [item.name, item.checksum])
    ),
    operationState: "unknown",
    recoveryRequired: false,
  };
  try {
    const context = await runCommand("docker", ["context", "show"]);
    base.dockerContextClass = ["default", "desktop-linux"].includes(context.stdout.trim())
      ? "local"
      : "remote";
    const adminUrl = requireValue(shadow, "POSTGRES_ADMIN_URL");
    const admin = await connect(adminUrl);
    try {
      const identity = await admin.query<{
        database: string;
        role: string;
        address: string;
        port: number;
        system_identifier: string;
      }>(`SELECT current_database() AS database, current_user AS role,
          inet_server_addr()::text AS address, inet_server_port() AS port,
          system_identifier::text FROM pg_control_system()`);
      if (
        identity.rows[0]?.database !== targets.maintenanceDatabase ||
        identity.rows[0]?.role !== targets.adminRole
      ) {
        throw new DatabaseToolError(
          "TARGET_REJECTED",
          "The local SQL identity is not allowlisted."
        );
      }
      base.sqlReady = true;
      await ensureLedger(admin);
      const operation = await admin.query<{ state: string }>(
        "SELECT state FROM feline_tool.refresh_operations ORDER BY started_at DESC LIMIT 1"
      );
      base.operationState = operation.rows[0]?.state || "none";
      base.recoveryRequired = Boolean(
        operation.rows[0] && !["complete", "rolled_back"].includes(operation.rows[0].state)
      );
    } finally {
      await admin.end();
    }
    const runtime = await connect(requireValue(development, "POSTGRES_DATABASE_URL"));
    try {
      const caps = await runtime.query<{
        createdb: boolean;
        createrole: boolean;
        superuser: boolean;
      }>(
        "SELECT rolcreatedb AS createdb, rolcreaterole AS createrole, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user"
      );
      base.effectiveCapabilities = caps.rows[0] || "unknown";
    } finally {
      await runtime.end();
    }
    const migrator = await connect(requireValue(development, "POSTGRES_MIGRATION_URL"));
    try {
      const applied = await migrator.query<{ migration_name: string; checksum: string }>(
        "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
      );
      const expected = new Map(migrationFiles.map((item) => [item.name, item.checksum]));
      const matches = applied.rows.every(
        (row) => expected.get(row.migration_name) === row.checksum
      );
      base.migrationState =
        matches && applied.rows.length === migrationFiles.length ? "current" : "drift";
    } catch {
      base.migrationState = "uninitialized";
    } finally {
      await migrator.end();
    }
  } catch {
    // Unknown fields remain explicit when inspection is unavailable.
  }
  return base;
}

export async function localDown(): Promise<void> {
  await withHostLock("local-down", async () => {
    await runCommand("docker", [...composeBaseArguments, "down"], {
      cwd: repositoryRoot,
      code: "DOCKER_UNAVAILABLE",
      phase: "compose-down",
    });
  });
}

interface OwnedComposeResources {
  composeArguments: string[];
  composeProject: string;
  composeService: string;
  composeVolume: string;
  owner: string;
}

async function destroyOwnedComposeResources(resources: OwnedComposeResources): Promise<void> {
  const dockerHost = process.env.DOCKER_HOST?.trim();
  if (dockerHost && !dockerHost.startsWith("npipe://") && !dockerHost.startsWith("unix://")) {
    throw new DatabaseToolError("TARGET_REJECTED", "The active Docker endpoint is not local.");
  }
  const context = (await runCommand("docker", ["context", "show"])).stdout.trim();
  if (!["default", "desktop-linux"].includes(context)) {
    throw new DatabaseToolError("TARGET_REJECTED", "The active Docker context is not local.");
  }
  const volumeInspection = await runCommand("docker", [
    "volume",
    "inspect",
    resources.composeVolume,
    "--format",
    "{{json .}}",
  ]);
  const volume = JSON.parse(volumeInspection.stdout) as {
    Labels?: Record<string, string>;
    Mountpoint?: string;
    Name?: string;
  };
  if (
    volume.Name !== resources.composeVolume ||
    volume.Labels?.["com.feline-blog.owner"] !== resources.owner ||
    volume.Labels?.["com.feline-blog.compose-project"] !== resources.composeProject ||
    !volume.Mountpoint
  ) {
    throw new DatabaseToolError("OWNERSHIP_AMBIGUOUS", "The local volume ownership is ambiguous.");
  }
  const containerIds = (
    await runCommand("docker", [
      ...resources.composeArguments,
      "ps",
      "--all",
      "--quiet",
      resources.composeService,
    ])
  ).stdout
    .split(/\r?\n/u)
    .filter(Boolean);
  for (const containerId of containerIds) {
    const inspection = await runCommand("docker", [
      "inspect",
      containerId,
      "--format",
      "{{json .}}",
    ]);
    const container = JSON.parse(inspection.stdout) as {
      Config?: { Labels?: Record<string, string> };
      Mounts?: Array<{ Destination?: string; Name?: string; Type?: string }>;
    };
    const labels = container.Config?.Labels;
    const mounts = container.Mounts || [];
    if (
      labels?.["com.feline-blog.owner"] !== resources.owner ||
      labels?.["com.feline-blog.compose-project"] !== resources.composeProject ||
      labels?.["com.docker.compose.project"] !== resources.composeProject ||
      mounts.length !== 1 ||
      mounts[0]?.Type !== "volume" ||
      mounts[0]?.Name !== resources.composeVolume ||
      mounts[0]?.Destination !== "/var/lib/postgresql/data"
    ) {
      throw new DatabaseToolError(
        "OWNERSHIP_AMBIGUOUS",
        "The local container ownership or mounts are ambiguous."
      );
    }
  }
  await runCommand("docker", [...resources.composeArguments, "down", "--volumes"], {
    cwd: repositoryRoot,
    phase: "compose-destroy",
  });
}

export async function localDestroy(confirmation: string | undefined): Promise<void> {
  const expected = `${targets.composeProject}:${targets.composeVolume}`;
  if (process.env.LOCAL_DATABASE_DESTROY_ALLOW !== "true" || confirmation !== expected) {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      `Set LOCAL_DATABASE_DESTROY_ALLOW=true and pass --confirm ${expected}.`
    );
  }
  await withHostLock("local-destroy", async () => {
    await destroyOwnedComposeResources({
      composeArguments: composeBaseArguments,
      composeProject: targets.composeProject,
      composeService: targets.composeService,
      composeVolume: targets.composeVolume,
      owner: "feline-blog-app",
    });
  });
}

export {
  connect,
  destroyOwnedComposeResources,
  ensureLedger,
  localFiles,
  localMigrationFiles,
  quoteIdentifier,
  reconcileDatabasePrivileges,
  withDatabaseLock,
};
