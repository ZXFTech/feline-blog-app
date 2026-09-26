import { describe, expect, it } from "vitest";
import { safeFailure } from "./errors";
import { runCommand } from "./process";

describe("runCommand", () => {
  it("covers: AC-12 returns separate stdout, stderr, and exit state", async () => {
    const result = await runCommand(process.execPath, [
      "-e",
      "process.stdout.write('child-output'); process.stderr.write('child-warning')",
    ]);

    expect(result).toEqual({
      stdout: "child-output",
      stderr: "child-warning",
      exitCode: 0,
    });
  });

  it("covers: AC-8 maps child failure without exposing child diagnostics", async () => {
    const secret = "postgresql://user:recognizable-password@example.invalid/private";

    await expect(
      runCommand(
        process.execPath,
        ["-e", `process.stderr.write(${JSON.stringify(secret)}); process.exit(7)`],
        { code: "RESTORE_FAILED", phase: "restore-consumer" }
      ).catch((error: unknown) => Promise.reject(safeFailure(error)))
    ).rejects.toEqual({
      ok: false,
      code: "RESTORE_FAILED",
      summary: `${process.execPath} failed with exit code 7.`,
      phase: "restore-consumer",
    });
  });

  it("covers: AC-12 maps a child start failure to the requested safe phase", async () => {
    await expect(
      runCommand("feline-command-that-does-not-exist", [], {
        code: "MIGRATION_DRIFT",
        phase: "prisma",
      }).catch((error: unknown) => Promise.reject(safeFailure(error)))
    ).rejects.toEqual({
      ok: false,
      code: "MIGRATION_DRIFT",
      summary: "feline-command-that-does-not-exist could not start.",
      phase: "prisma",
    });
  });

  it("accepts only an explicitly listed nonzero exit code", async () => {
    const command = ["-e", "process.stdout.write('pending'); process.exit(1)"];
    await expect(
      runCommand(process.execPath, command, { acceptedExitCodes: [1] })
    ).resolves.toEqual({ stdout: "pending", stderr: "", exitCode: 1 });
    await expect(
      runCommand(process.execPath, ["-e", "process.exit(2)"], {
        acceptedExitCodes: [1],
        code: "MIGRATION_DRIFT",
      })
    ).rejects.toMatchObject({ code: "MIGRATION_DRIFT" });
  });

  it("covers: AC-15 terminates a child process when its controller aborts", async () => {
    const controller = new AbortController();
    const running = runCommand(
      process.execPath,
      ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],
      {
        code: "MIGRATION_DRIFT",
        phase: "prisma",
        signal: controller.signal,
        killGracePeriodMillis: 25,
      }
    );

    setTimeout(() => controller.abort(), 25);

    await expect(running).rejects.toMatchObject({
      code: "MIGRATION_DRIFT",
      phase: "prisma",
    });
  });
});
