import path from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { RebuildError } from "./contracts";
import { insideState, privateConfigFile, privateDirectory } from "./files";
import { cutoffSchema, parsePlan } from "./maintenance-plan";
import { object, openMaintenance, readState } from "./maintenance-store";
import {
  applyActivation,
  applyBootstrap,
  applyRestore,
  planActivation,
  planBootstrap,
  planRestore,
  verifyRestoration,
} from "./maintenance";

const common = ["--env-file", "--runtime-env-file", "--profiles-file"];
export function parseMaintenanceArguments(args: string[]) {
  const [command, ...rest] = args;
  if (!["inspect", "bootstrap", "restore", "activate", "verify"].includes(command))
    throw new RebuildError("INVALID_COMMAND");
  const options: Record<string, string> = {};
  let mode: "plan" | "apply" | undefined;
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (["--plan", "--apply"].includes(key)) {
      if (mode) throw new RebuildError("INVALID_ARGUMENTS");
      mode = key === "--plan" ? "plan" : "apply";
      continue;
    }
    const value = rest[++i];
    if (!value || value.startsWith("--") || key in options)
      throw new RebuildError("INVALID_ARGUMENTS");
    options[key] = value;
  }
  const needed = [...common];
  if (["bootstrap", "restore", "activate"].includes(command) && !mode)
    throw new RebuildError("MAINTENANCE_MODE_REQUIRED");
  if (mode === "apply" || command === "verify") needed.push("--plan-file");
  if (mode === "plan") {
    needed.push("--auth-user-id", "--operator-label", "--out");
    if (command === "restore")
      needed.push("--backup-id", "--manifest-sha256", "--source-cutoff-file");
    if (command === "activate") needed.push("--evidence-file");
  }
  if (
    ((command === "inspect" || command === "verify") && mode) ||
    needed.some((key) => !options[key]) ||
    Object.keys(options).some((key) => !needed.includes(key))
  )
    throw new RebuildError("INVALID_ARGUMENTS");
  return { command, mode, options };
}
export async function maintenanceMain(args: string[]) {
  const { command, mode, options } = parseMaintenanceArguments(args);
  const context = await openMaintenance({
    envFile: options["--env-file"],
    runtimeEnvFile: options["--runtime-env-file"],
    profilesFile: options["--profiles-file"],
  });
  try {
    if (command === "inspect") {
      const state = await readState(context);
      const users = (
        await context.client.query(
          `SELECT id,role::text,"emailVerified","profileCompletedAt" IS NOT NULL AS profile_complete,(SELECT count(*)::int FROM ${object(context, "sessions")} s WHERE s."userId"=u.id AND s."expiresAt">clock_timestamp()) AS active_sessions FROM ${object(context, "users")} u ORDER BY id`
        )
      ).rows;
      return {
        code: "MAINTENANCE_STATUS",
        phase: state.phase,
        revision: state.revision,
        targetGeneration: state.targetGeneration,
        users,
      };
    }
    if (mode === "apply" || command === "verify") {
      const plan = parsePlan(
        JSON.parse((await privateConfigFile(options["--plan-file"])).toString("utf8"))
      );
      if (command === "verify") {
        if (plan.command !== "restore") throw new RebuildError("INVALID_PLAN_COMMAND");
        return verifyRestoration(context, plan);
      }
      if (plan.command !== command) throw new RebuildError("INVALID_PLAN_COMMAND");
      return plan.command === "bootstrap"
        ? applyBootstrap(context, plan)
        : plan.command === "restore"
          ? applyRestore(context, plan)
          : applyActivation(context, plan);
    }
    const userId = options["--auth-user-id"],
      label = options["--operator-label"];
    const plan =
      command === "bootstrap"
        ? await planBootstrap(context, userId, label)
        : command === "restore"
          ? await planRestore(
              context,
              userId,
              label,
              options["--backup-id"],
              options["--manifest-sha256"],
              cutoffSchema.parse(
                JSON.parse(
                  (await privateConfigFile(options["--source-cutoff-file"])).toString("utf8")
                )
              )
            )
          : await planActivation(context, userId, label, options["--evidence-file"]);
    if (!("schemaVersion" in plan)) return plan;
    const output = path.resolve(options["--out"]),
      relative = path.relative(path.resolve(".feline-blog"), output);
    if (relative.startsWith("..") || path.isAbsolute(relative) || insideState(relative) !== output)
      throw new RebuildError("MAINTENANCE_PLAN_PATH_REJECTED");
    await privateDirectory(path.dirname(output));
    await writeFile(output, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return {
      code: "PLAN_CREATED",
      command,
      planFile: output,
      planDigest: plan.planDigest,
      expiresAt: plan.expiresAt,
      databaseWritten: false,
    };
  } finally {
    await context.close();
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await maintenanceMain(process.argv.slice(2))));
  } catch (error) {
    console.error(
      JSON.stringify({ code: error instanceof RebuildError ? error.code : "MAINTENANCE_FAILED" })
    );
    process.exitCode = 1;
  }
}
