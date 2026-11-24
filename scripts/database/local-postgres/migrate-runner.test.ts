import { afterEach, describe, expect, it, vi } from "vitest";
import { runPrisma } from "./migrate";
import { runCommand } from "./process";

vi.mock("./process", () => ({
  runCommand: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Prisma pnpm launcher", () => {
  it("runs a native pnpm executable directly, preserving argument boundaries", async () => {
    vi.stubEnv("npm_execpath", "C:/Program Files/pnpm/pnpm.exe");
    await runPrisma(["migrate", "deploy"], { NODE_ENV: "test" });
    expect(runCommand).toHaveBeenCalledWith(
      "C:/Program Files/pnpm/pnpm.exe",
      ["exec", "prisma", "migrate", "deploy", "--config", "./prisma.postgres.config.ts"],
      expect.objectContaining({ env: { NODE_ENV: "test" } })
    );
  });

  it("uses the selected Node runtime for the pnpm JavaScript entrypoint", async () => {
    vi.stubEnv("npm_execpath", "C:/pnpm/bin/pnpm.cjs");
    await runPrisma(["migrate", "status"], { NODE_ENV: "test" });
    expect(runCommand).toHaveBeenCalledWith(
      process.execPath,
      [
        "C:/pnpm/bin/pnpm.cjs",
        "exec",
        "prisma",
        "migrate",
        "status",
        "--config",
        "./prisma.postgres.config.ts",
      ],
      expect.anything()
    );
  });
});
