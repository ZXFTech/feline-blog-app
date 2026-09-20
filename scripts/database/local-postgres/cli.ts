import { safeFailure, DatabaseToolError } from "./errors";
import {
  cleanChildEnvironment,
  readEnvironmentFile,
  rejectInheritedProtectedEnvironment,
  rejectNextEnvironmentOverrides,
  requireValue,
} from "./env";
import { repositoryRoot, targets } from "./config";
import { localDestroy, localDown, localSetup, localStatus, localUp } from "./local";
import { localMigrate } from "./migrate";
import {
  deployStaging,
  setupStagingExporter,
  stagingStatus,
  verifyStagingExporter,
} from "./staging";
import { classifyLocalTarget } from "./target";
import { runCommand } from "./process";
import { recoverLocalRefresh, refreshLocalFromStaging } from "./refresh";
import { normalizeForwardedArguments, parseRecoveryOperationId } from "./arguments";

function output(value: unknown, human: boolean): void {
  if (!human || typeof value !== "object" || value === null) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    console.log(`${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`);
  }
}

async function runDevelopmentServer(): Promise<void> {
  rejectInheritedProtectedEnvironment(process.env);
  await rejectNextEnvironmentOverrides();
  const development = await readEnvironmentFile(".env.development");
  classifyLocalTarget(
    requireValue(development, "POSTGRES_DATABASE_URL"),
    targets.developmentDatabase,
    targets.runtimeRole,
    development.POSTGRES_ENVIRONMENT
  );
  const pnpmEntrypoint = process.env.npm_execpath;
  if (!pnpmEntrypoint) throw new DatabaseToolError("CONFIG_CONFLICT", "Run dev through pnpm.");
  const runtimeEnvironment = { ...development };
  delete runtimeEnvironment.DATABASE_URL;
  await runCommand(process.execPath, [pnpmEntrypoint, "exec", "next", "dev", "--turbopack"], {
    cwd: repositoryRoot,
    env: cleanChildEnvironment([runtimeEnvironment]),
    inherit: true,
    code: "CONFIG_CONFLICT",
    phase: "next-development",
  });
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function requireNoArguments(args: readonly string[], command: string): void {
  if (args.length > 0) {
    throw new DatabaseToolError("CONFIG_CONFLICT", `${command} accepts no arguments.`);
  }
}

function requireOnlyFlags(
  args: readonly string[],
  flags: readonly string[],
  command: string
): void {
  if (args.some((arg) => !flags.includes(arg))) {
    throw new DatabaseToolError("CONFIG_CONFLICT", `${command} received an unsupported argument.`);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const args = normalizeForwardedArguments(process.argv.slice(3));
  const allowedGates =
    command === "local-destroy"
      ? ["LOCAL_DATABASE_DESTROY_ALLOW"]
      : command === "local-refresh"
        ? ["STAGING_DATA_COPY_ALLOW", "STAGING_DATA_COPY_TRUSTED_WORKSTATION"]
        : command === "staging-deploy"
          ? ["STAGING_MIGRATION_ALLOW_WRITE"]
          : command === "staging-exporter-setup"
            ? ["STAGING_ROLE_SETUP_ALLOW_WRITE"]
            : [];
  if (command !== "dev") rejectInheritedProtectedEnvironment(process.env, allowedGates);

  switch (command) {
    case "dev":
      await runDevelopmentServer();
      break;
    case "local-up":
      requireNoArguments(args, "local up");
      await localUp();
      output({ ok: true, service: targets.composeService, state: "healthy" }, false);
      break;
    case "local-setup":
      requireNoArguments(args, "local setup");
      await localSetup();
      output(
        {
          ok: true,
          databases: [targets.developmentDatabase, targets.shadowDatabase, targets.verifyDatabase],
        },
        false
      );
      break;
    case "local-status":
      requireOnlyFlags(args, ["--human"], "local status");
      output(await localStatus(), args.includes("--human"));
      break;
    case "local-migrate":
      await localMigrate(args);
      output({ ok: true, migration: valueAfter(args, "--name") }, false);
      break;
    case "local-down":
      requireNoArguments(args, "local down");
      await localDown();
      output({ ok: true, volumeRetained: targets.composeVolume }, false);
      break;
    case "local-refresh":
      if (args.length > 0)
        throw new DatabaseToolError("CONFIG_CONFLICT", "local refresh accepts no arguments.");
      await refreshLocalFromStaging();
      output({ ok: true, refresh: "complete" }, false);
      break;
    case "local-recover":
      await recoverLocalRefresh(parseRecoveryOperationId(args));
      output({ ok: true, recovery: "complete" }, false);
      break;
    case "local-destroy":
      if (args.length !== 2 || args[0] !== "--confirm") {
        throw new DatabaseToolError(
          "CONFIG_CONFLICT",
          "local destroy accepts only --confirm followed by the exact resource name."
        );
      }
      await localDestroy(valueAfter(args, "--confirm"));
      output({ ok: true, removedVolume: targets.composeVolume }, false);
      break;
    case "staging-status":
      requireOnlyFlags(args, ["--human"], "staging status");
      output(await stagingStatus(), args.includes("--human"));
      break;
    case "staging-deploy":
      if (args.length > 0)
        throw new DatabaseToolError("CONFIG_CONFLICT", "staging deploy accepts no arguments.");
      await deployStaging();
      output({ ok: true, migrationState: "deployed" }, false);
      break;
    case "staging-exporter-setup":
      if (args.some((arg) => arg !== "--rotate")) {
        throw new DatabaseToolError("CONFIG_CONFLICT", "Exporter setup accepts only --rotate.");
      }
      await setupStagingExporter(args.includes("--rotate"));
      output({ ok: true, exporter: "verified" }, false);
      break;
    case "staging-exporter-verify":
      if (args.length > 0)
        throw new DatabaseToolError("CONFIG_CONFLICT", "Exporter verify accepts no arguments.");
      await verifyStagingExporter();
      output({ ok: true, exporter: "read-only" }, false);
      break;
    case "legacy-migrate-dev":
      console.error("postgres:migrate:dev is deprecated. Use db:local:migrate.");
      await localMigrate(args);
      break;
    case "legacy-local-status":
      requireOnlyFlags(args, ["--human", "--audit"], "legacy local status");
      console.error("This command is deprecated. Use db:local:status.");
      output(await localStatus(), args.includes("--human"));
      break;
    case "legacy-deploy":
      throw new DatabaseToolError(
        "TARGET_REJECTED",
        "postgres:migrate:deploy is disabled. Use guarded db:staging:deploy."
      );
    case "legacy-role-setup":
      throw new DatabaseToolError(
        "TARGET_REJECTED",
        "Use db:local:setup or guarded db:staging:exporter:setup."
      );
    case "legacy-smoke":
      throw new DatabaseToolError(
        "TARGET_REJECTED",
        "Use db:local:test or the guarded refresh smoke phase."
      );
    default:
      throw new DatabaseToolError("CONFIG_CONFLICT", "The database command is not recognized.");
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify(safeFailure(error)));
  process.exitCode = 1;
});
