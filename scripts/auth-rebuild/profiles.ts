import path from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { selectConfiguration } from "../../src/lib/auth/sdk/configuration";
import { insideState, privateConfigFile, privateDirectory } from "./files";

export async function exportProfile(args: string[]) {
  const [command, ...rest] = args;
  if (!["export", "doctor"].includes(command) || rest.length !== 2 || rest[0] !== "--env-file")
    throw Error("INVALID_ARGUMENTS");
  const envFile = path.resolve(rest[1]);
  const fileValues = dotenv.parse(await privateConfigFile(envFile));
  const values = { ...process.env, ...fileValues };
  values.NODE_ENV ??= "development";
  if (!values.USER_CENTER_CONFIG_FILE) throw Error("ENVIRONMENT_MISMATCH");
  const profilesFile = path.resolve(values.USER_CENTER_CONFIG_FILE);
  if ((await stat(profilesFile)).size > 65536) throw Error("ENVIRONMENT_MISMATCH");
  const selected = selectConfiguration(
    JSON.parse((await privateConfigFile(profilesFile)).toString("utf8")),
    values
  );
  const out = insideState("auth-rebuild", "selected-manifests");
  await privateDirectory(out);
  const manifestFile = path.join(
    out,
    `${selected.environment.runtimeEnvironment}-to-${selected.environment.targetEnvironment}.json`
  );
  await writeFile(manifestFile, `${JSON.stringify(selected.manifest, null, 2)}\n`, { mode: 0o600 });
  const host = {
    ...selected.environment,
    manifestFile,
    callbackUrl: selected.publicConfig.callbackUrl,
    databaseBindingPresent: !!selected.database,
    databaseConnected: false,
    networkRequested: false,
  };
  if (command === "export") return { host, exitCode: 0 };
  const cliRoot = path.resolve("node_modules/@user-center/cli");
  const pkg = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(cliRoot, pkg.bin["user-center"]),
      "doctor",
      "--config",
      manifestFile,
      "--project",
      process.cwd(),
      "--env-file",
      envFile,
      "--json",
    ],
    { encoding: "utf8", env: values, windowsHide: true, timeout: 30000, maxBuffer: 1048576 }
  );
  const report = JSON.parse(result.stdout || "{}");
  if (!Array.isArray(report.checks)) throw Error("DOCTOR_UNAVAILABLE");
  return {
    host,
    exitCode: result.status ?? 3,
    overall: report.overall,
    checks: report.checks.map((check: { id: string; status: string; code: string }) => ({
      id: check.id,
      status: check.status,
      code: check.code,
    })),
  };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await exportProfile(process.argv.slice(2));
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
  } catch {
    console.error(
      JSON.stringify({
        code: "ENVIRONMENT_MISMATCH",
        message: "检查所选 profiles、runtime/target、Client 和明确环境文件；不回退其他环境。",
        databaseConnected: false,
      })
    );
    process.exitCode = 3;
  }
}
