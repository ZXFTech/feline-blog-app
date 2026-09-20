import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isProtectedKey, repositoryRoot } from "./config";

const tsxCli = path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
const databaseCli = path.join(repositoryRoot, "scripts", "database", "local-postgres", "cli.ts");

function runCli(...args: string[]) {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !isProtectedKey(key))),
  };
  return spawnSync(process.execPath, [tsxCli, databaseCli, ...args], {
    cwd: repositoryRoot,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
  });
}

describe("database CLI rejection paths", () => {
  it.each([
    ["legacy-deploy", "TARGET_REJECTED", "guarded db:staging:deploy"],
    ["legacy-role-setup", "TARGET_REJECTED", "db:local:setup"],
    ["legacy-smoke", "TARGET_REJECTED", "guarded refresh smoke phase"],
  ])("covers: AC-11 keeps %s fail closed", (command, code, summary) => {
    const result = runCli(command);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`\"code\":\"${code}\"`);
    expect(result.stderr).toContain(summary);
  });

  it("covers: AC-9 normalizes the pnpm separator before destroy confirmation", () => {
    const result = runCli("local-destroy", "--", "--confirm", "wrong-resource");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"code":"TARGET_REJECTED"');
    expect(result.stderr).toContain("feline-blog-local:feline_blog_postgres_data");
    expect(result.stderr).not.toContain("unsupported argument");
  });

  it("covers: AC-7 normalizes rotate before applying the process only write gate", () => {
    const result = runCli("staging-exporter-setup", "--", "--rotate");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"code":"TARGET_REJECTED"');
    expect(result.stderr).toContain("STAGING_ROLE_SETUP_ALLOW_WRITE=true");
    expect(result.stderr).not.toContain("unsupported argument");
  });

  it("covers: AC-6 rejects malformed recovery ids without relaying the input", () => {
    const marker = "recognizable-secret-operation-id";
    const result = runCli("local-recover", "--", "--operation", marker);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"code":"CONFIG_CONFLICT"');
    expect(result.stderr).toContain("32 character lowercase hexadecimal id");
    expect(result.stderr).not.toContain(marker);
  });
});
