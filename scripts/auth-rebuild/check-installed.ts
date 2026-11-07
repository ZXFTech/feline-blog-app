import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TOOL_VERSION } from "@user-center/next-better-auth/public";

export const expectedSdkVersion = "0.1.10";

// Installed package metadata only. No env files, archived releases, network or DB.
export async function checkInstalledSdk() {
  const host = JSON.parse(await readFile("package.json", "utf8"));
  const cli = JSON.parse(await readFile("node_modules/@user-center/cli/package.json", "utf8"));
  const sdk = JSON.parse(
    await readFile("node_modules/@user-center/next-better-auth/package.json", "utf8")
  );
  if (
    TOOL_VERSION !== expectedSdkVersion ||
    sdk.version !== expectedSdkVersion ||
    cli.version !== expectedSdkVersion ||
    host.dependencies?.["@user-center/next-better-auth"] !== expectedSdkVersion ||
    host.devDependencies?.["@user-center/cli"] !== expectedSdkVersion ||
    host.dependencies?.["better-auth"] !== "1.7.12" ||
    host.dependencies?.["server-only"] !== "0.0.1"
  )
    throw Error("SDK_INSTALLED_VERSION_MISMATCH");
  return {
    sdkVersion: sdk.version as string,
    cliVersion: cli.version as string,
    distribution: "registry" as const,
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(
      JSON.stringify({
        code: "SDK_INSTALLED_VERSION_VERIFIED",
        ...(await checkInstalledSdk()),
        databaseConnected: false,
      })
    );
  } catch {
    console.error(JSON.stringify({ code: "SDK_INSTALLED_VERSION_MISMATCH" }));
    process.exitCode = 1;
  }
}
