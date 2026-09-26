import { rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseToolError } from "./errors";
import { cleanChildEnvironment, requireValue } from "./env";
import { withHostLock } from "./lock";
import {
  connect,
  localFiles,
  localMigrationFiles,
  quoteIdentifier,
  reconcileDatabasePrivileges,
  withDatabaseLock,
} from "./local";
import { repositoryRoot, targets } from "./config";
import { runCommand } from "./process";
import type { CommandResult } from "./process";

export function parseMigrationName(args: readonly string[]): string {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  if (
    normalized.length !== 2 ||
    normalized[0] !== "--name" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized[1] || "") ||
    (normalized[1]?.length || 0) > 64
  ) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      "Use exactly --name followed by 1 to 64 lowercase letters, digits, or single hyphens."
    );
  }
  return normalized[1] as string;
}

async function runPrisma(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  options: {
    signal?: AbortSignal;
    killGracePeriodMillis?: number;
    captureOutput?: boolean;
    acceptedExitCodes?: readonly number[];
  } = {}
): Promise<CommandResult> {
  const pnpmEntrypoint = process.env.npm_execpath;
  if (!pnpmEntrypoint) {
    throw new DatabaseToolError("CONFIG_CONFLICT", "Run this command through pnpm.");
  }
  return await runCommand(
    process.execPath,
    [pnpmEntrypoint, "exec", "prisma", ...args, "--config", "./prisma.postgres.config.ts"],
    {
      cwd: repositoryRoot,
      env: environment,
      inherit: !options.captureOutput,
      code: "MIGRATION_DRIFT",
      phase: "prisma",
      signal: options.signal,
      killGracePeriodMillis: options.killGracePeriodMillis,
      acceptedExitCodes: options.acceptedExitCodes,
    }
  );
}

async function recreateVerifyDatabase(adminUrl: string): Promise<void> {
  await withDatabaseLock(adminUrl, async (admin) => {
    const active = await admin.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() LIMIT 1",
      [targets.verifyDatabase]
    );
    if (active.rowCount) {
      throw new DatabaseToolError("ACTIVE_CONNECTIONS", "The verify database has active sessions.");
    }
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targets.verifyDatabase)}`);
    await admin.query(
      `CREATE DATABASE ${quoteIdentifier(targets.verifyDatabase)} OWNER ${quoteIdentifier(targets.adminRole)}`
    );
    await admin.query(
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(targets.verifyDatabase)} FROM PUBLIC`
    );
    await admin.query(
      `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(targets.verifyDatabase)} TO ${quoteIdentifier(targets.migratorRole)}`
    );
  });
  await reconcileDatabasePrivileges(adminUrl, targets.verifyDatabase);
}

async function assertMigrationReplay(verifyUrl: string): Promise<void> {
  const expected = await localMigrationFiles();
  const client = await connect(verifyUrl);
  try {
    const applied = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      logs: string | null;
    }>(
      "SELECT migration_name, checksum, finished_at, rolled_back_at, logs FROM _prisma_migrations ORDER BY migration_name"
    );
    if (applied.rows.length !== expected.length) {
      throw new DatabaseToolError(
        "MIGRATION_DRIFT",
        "Verify migration names do not match the working tree."
      );
    }
    for (const [index, item] of expected.entries()) {
      const row = applied.rows[index];
      if (
        row?.migration_name !== item.name ||
        row.checksum !== item.checksum ||
        !row.finished_at ||
        row.rolled_back_at ||
        row.logs
      ) {
        throw new DatabaseToolError(
          "MIGRATION_DRIFT",
          `Migration ${item.name} did not replay cleanly.`
        );
      }
    }
  } finally {
    await client.end();
  }
}

async function schemaSignature(connectionString: string): Promise<string> {
  const client = await connect(connectionString);
  try {
    const result = await client.query<{ signature: string }>(`WITH objects AS (
      SELECT 'column' AS kind,
        format('%I.%I.%I:%s:%s:%s', table_schema, table_name, column_name,
          data_type, is_nullable, coalesce(column_default, '')) AS definition
      FROM information_schema.columns WHERE table_schema = 'public'
      UNION ALL
      SELECT 'constraint', format('%I.%I:%I:%s', n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true))
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT 'index', indexdef FROM pg_indexes WHERE schemaname = 'public'
      UNION ALL
      SELECT 'sequence', format('%I.%I', schemaname, sequencename)
      FROM pg_sequences WHERE schemaname = 'public'
    ) SELECT md5(string_agg(kind || ':' || definition, E'\\n' ORDER BY kind, definition)) AS signature FROM objects`);
    return result.rows[0]?.signature || "empty";
  } finally {
    await client.end();
  }
}

export async function localMigrate(rawArgs: readonly string[]): Promise<void> {
  const name = parseMigrationName(rawArgs);
  await withHostLock("local-migrate", async () => {
    const { development, shadow } = await localFiles();
    const adminUrl = requireValue(shadow, "POSTGRES_ADMIN_URL");
    const migrationUrl = requireValue(development, "POSTGRES_MIGRATION_URL");
    const shadowUrl = requireValue(shadow, "POSTGRES_SHADOW_DATABASE_URL");
    const verifyUrl = requireValue(shadow, "POSTGRES_VERIFY_DATABASE_URL");
    const migrationEnvironment = cleanChildEnvironment([development, shadow], {
      POSTGRES_MIGRATION_URL: migrationUrl,
      POSTGRES_SHADOW_DATABASE_URL: shadowUrl,
    });
    await runPrisma(["migrate", "dev", "--name", name], migrationEnvironment);
    await runPrisma(["generate"], cleanChildEnvironment([]));
    await recreateVerifyDatabase(adminUrl);
    await runPrisma(
      ["migrate", "deploy"],
      cleanChildEnvironment([], { POSTGRES_MIGRATION_URL: verifyUrl })
    );
    await assertMigrationReplay(verifyUrl);
    const [verifySignature, developmentSignature] = await Promise.all([
      schemaSignature(verifyUrl),
      schemaSignature(migrationUrl),
    ]);
    if (verifySignature !== developmentSignature) {
      throw new DatabaseToolError("MIGRATION_DRIFT", "Development and verify schemas differ.");
    }
    await reconcileDatabasePrivileges(adminUrl, targets.developmentDatabase);
    await reconcileDatabasePrivileges(adminUrl, targets.shadowDatabase);
    await reconcileDatabasePrivileges(adminUrl, targets.verifyDatabase);
    await rm(path.join(repositoryRoot, ".feline-blog", "prisma-output"), {
      recursive: true,
      force: true,
    });
  });
}

export { runPrisma };
