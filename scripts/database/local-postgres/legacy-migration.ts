import { cleanChildEnvironment, readEnvironmentFile, requireValue } from "./env";
import { DatabaseToolError, safeFailure } from "./errors";
import { classifyStagingTarget } from "./target";
import { repositoryRoot, targets } from "./config";
import { runCommand } from "./process";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--apply", "--verify-only"].includes(args[0] || "")) {
    throw new DatabaseToolError("CONFIG_CONFLICT", "Choose one legacy migration mode.");
  }
  const development = await readEnvironmentFile(".env.development");
  const staging = await readEnvironmentFile(".env.staging");
  const migrationUrl = requireValue(staging, "POSTGRES_MIGRATION_URL");
  const runtimeUrl = requireValue(staging, "POSTGRES_DATABASE_URL");
  classifyStagingTarget(migrationUrl, targets.migratorRole, "staging");
  classifyStagingTarget(runtimeUrl, targets.runtimeRole, "staging");
  const environment = cleanChildEnvironment([], {
    DATABASE_URL: requireValue(development, "DATABASE_URL"),
    POSTGRES_ENVIRONMENT: "staging",
    POSTGRES_DATABASE_URL: runtimeUrl,
    POSTGRES_MIGRATION_URL: migrationUrl,
    POSTGRES_SSL_CA: requireValue(staging, "POSTGRES_SSL_CA"),
    POSTGRES_MIGRATION_ALLOW_WRITE: process.env.POSTGRES_MIGRATION_ALLOW_WRITE,
  });
  const pnpmEntrypoint = process.env.npm_execpath;
  if (!pnpmEntrypoint)
    throw new DatabaseToolError("CONFIG_CONFLICT", "Run this command through pnpm.");
  await runCommand(
    process.execPath,
    [
      pnpmEntrypoint,
      "exec",
      "tsx",
      "./scripts/database/migrate-legacy-to-postgres.ts",
      args[0] as string,
    ],
    {
      cwd: repositoryRoot,
      env: environment,
      inherit: true,
      code: "TARGET_REJECTED",
      phase: "legacy-migration",
    }
  );
}

main().catch((error: unknown) => {
  console.error(JSON.stringify(safeFailure(error)));
  process.exitCode = 1;
});
