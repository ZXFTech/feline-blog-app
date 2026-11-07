// Public exports and local doctor fixtures only. No real center, env files or DB.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { TOOL_VERSION } from "@user-center/next-better-auth/public";

const publicRoot = await import("@user-center/next-better-auth");
const publicApi = await import("@user-center/next-better-auth/public");
const config = await import("@user-center/next-better-auth/config");
const client = await import("@user-center/next-better-auth/client");
const server = await import("@user-center/next-better-auth/server");
assert.equal(TOOL_VERSION, "0.1.10");
assert.equal(publicRoot.TOOL_VERSION, publicApi.TOOL_VERSION);
assert.equal(typeof client.createUserCenterClient, "function");
assert.equal(typeof server.createUserCenterAuth, "function");
const issuer = "https://center-ci.example.invalid/api/auth";
const origin = "https://blog-ci.example.invalid";
const registration = config.describeRegistration({ issuer, platformOrigin: origin });
assert.ok(registration.callbackUrl.startsWith(origin + "/api/auth/callback/user-center-"));

const temporaryRoot = path.resolve(os.tmpdir());
const directory = await mkdtemp(path.join(temporaryRoot, "feline-sdk-smoke-"));
try {
  const manifest = path.join(directory, "manifest.json");
  const envFile = path.join(directory, "fixture.env");
  await writeFile(manifest, JSON.stringify({
    schemaVersion: 1, issuer, platformOrigin: origin,
    clientId: "synthetic-client", clientSecretEnv: "SDK_SMOKE_CLIENT_SECRET",
    sessionSecretEnv: "SDK_SMOKE_SESSION_SECRET", authBasePath: "/api/auth", errorPath: "/auth/error",
    returnTo: { fallback: "/profile", allowedPaths: ["/profile"], allowedPathPrefixes: [], allowedQueryKeys: [] },
  }));
  await writeFile(envFile, "SDK_SMOKE_CLIENT_SECRET=synthetic-client-secret-for-local-fixture\nSDK_SMOKE_SESSION_SECRET=synthetic-independent-session-secret-for-local-fixture\n");
  const cliRoot = path.resolve("node_modules/@user-center/cli");
  const cli = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));
  assert.equal(cli.version, TOOL_VERSION);
  const checks = [];
  for (const json of [true, false]) {
    const child = spawnSync(process.execPath, [path.resolve(cliRoot, cli.bin["user-center"]), "doctor", "--config", manifest, "--project", process.cwd(), "--env-file", envFile, ...(json ? ["--json"] : [])], {
      encoding: "utf8", windowsHide: true, timeout: 30000,
      env: { ...process.env, SDK_SMOKE_CLIENT_SECRET: "synthetic-client-secret-for-local-fixture", SDK_SMOKE_SESSION_SECRET: "synthetic-independent-session-secret-for-local-fixture" },
    });
    assert.equal(child.status, 2, "Unverified runtime combination must remain BLOCKED");
    if (json) {
      const report = JSON.parse(child.stdout);
      assert.equal(report.overall, "BLOCKED");
      assert.ok(report.checks.some(check => check.code === "COMBINATION_UNVERIFIED" && check.status === "BLOCKED"));
      assert.ok(!report.checks.some(check => check.status === "FAIL"));
    } else assert.ok(child.stdout.includes("COMBINATION_UNVERIFIED"));
    checks.push({ format: json ? "json" : "human", exit: child.status, expected: true });
  }
  console.log(JSON.stringify({ sdkVersion: TOOL_VERSION, publicEntriesLoaded: 5, registration: "PASS", doctor: checks, databaseConnected: false, realNetworkRequested: false, realAuthenticationVerified: false }));
} finally {
  if (path.dirname(directory) === temporaryRoot && path.basename(directory).startsWith("feline-sdk-smoke-")) await rm(directory, { recursive: true, force: true });
}
