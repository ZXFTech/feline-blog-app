import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { repositoryRoot } from "../database/local-postgres/config";
import { reconcileStagingMigrations } from "../database/local-postgres/staging";
import { connect, localMigrationFiles } from "../database/local-postgres/local";
import {
  assertSafeMigrationSql,
  reconcileMigrationHistory,
  StagingContractError,
} from "./staging-core";

const execFileAsync = promisify(execFile);
const migrationRoot = path.join(repositoryRoot, "prisma", "postgres", "migrations");

async function git(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.stdout;
}

export function parseNameStatus(output: string): Array<{ status: string; paths: string[] }> {
  const fields = output.split("\0").filter(Boolean);
  const changes: Array<{ status: string; paths: string[] }> = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++] ?? "";
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    changes.push({ status, paths: fields.slice(index, index + pathCount) });
    index += pathCount;
  }
  return changes;
}

export function assertImmutableMigrationChanges(
  changes: readonly { status: string; paths: readonly string[] }[]
): string[] {
  const added: string[] = [];
  for (const change of changes) {
    if (change.status === "A") {
      added.push(change.paths[0] ?? "");
      continue;
    }
    throw new StagingContractError(
      "MIGRATION_DIVERGENT",
      `Existing migration history is immutable: ${change.status} ${change.paths.join(" -> ")}.`
    );
  }
  return added;
}

export async function verifyPullRequestMigrations(baseSha: string): Promise<void> {
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) {
    throw new StagingContractError("HEAD_DRIFT", "PR merge base must be a full commit SHA.");
  }
  const output = await git([
    "diff",
    "--name-status",
    "-z",
    `${baseSha}...HEAD`,
    "--",
    "prisma/postgres/migrations",
  ]);
  const addedPaths = assertImmutableMigrationChanges(parseNameStatus(output));
  const directories = new Set(
    addedPaths.filter((file) => file.endsWith("/migration.sql")).map((file) => path.dirname(file))
  );
  for (const directory of directories) {
    const sql = await readFile(path.join(repositoryRoot, directory, "migration.sql"), "utf8");
    assertSafeMigrationSql(sql, path.basename(directory));
  }
}

export async function verifyAllMigrationDirectories(): Promise<void> {
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await readFile(path.join(migrationRoot, entry.name, "migration.sql"));
  }
}

export async function verifyReplay(connectionString: string): Promise<void> {
  const files = await localMigrationFiles();
  const client = await connect(connectionString);
  try {
    const result = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at, id"
    );
    const decision = reconcileMigrationHistory(
      files,
      result.rows.map((row) => ({
        migrationName: row.migration_name,
        checksum: row.checksum,
        finishedAt: row.finished_at,
        rolledBackAt: row.rolled_back_at,
      }))
    );
    if (decision.pending.length > 0 || decision.applied.length !== files.length) {
      throw new StagingContractError("MIGRATION_DIVERGENT", "Empty database replay is incomplete.");
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const [command, value] = process.argv.slice(2);
  if (command === "verify-pr" && value) {
    await verifyPullRequestMigrations(value);
    await verifyAllMigrationDirectories();
    process.stdout.write("PostgreSQL migration history is immutable and added SQL is safe.\n");
    return;
  }
  if (command === "reconcile-staging") {
    const decision = await reconcileStagingMigrations();
    process.stdout.write(
      JSON.stringify({
        applied: decision.applied.map(({ name, checksum }) => ({
          name,
          checksumPrefix: checksum.slice(0, 12),
        })),
        pending: decision.pending.map(({ name, checksum }) => ({
          name,
          checksumPrefix: checksum.slice(0, 12),
        })),
        rolledBack: decision.rolledBack,
      }) + "\n"
    );
    return;
  }
  if (command === "verify-replay") {
    const connectionString = process.env.POSTGRES_MIGRATION_URL;
    if (!connectionString) throw new Error("POSTGRES_MIGRATION_URL is required.");
    await verifyReplay(connectionString);
    process.stdout.write("PostgreSQL migrations replayed cleanly from an empty database.\n");
    return;
  }
  throw new Error(
    "Use migration-check verify-pr <merge-base-sha>, verify-replay, or reconcile-staging."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const safe =
      error instanceof StagingContractError
        ? { code: error.code, message: error.message }
        : { code: "MIGRATION_FAILED", message: "Migration check failed." };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
