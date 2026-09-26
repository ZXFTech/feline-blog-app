import { spawn } from "node:child_process";
import { DatabaseToolError, type DatabaseErrorCode } from "./errors";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    inherit?: boolean;
    code?: DatabaseErrorCode;
    phase?: string;
    signal?: AbortSignal;
    killGracePeriodMillis?: number;
    acceptedExitCodes?: readonly number[];
  } = {}
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", abortChild);
    };
    const abortChild = () => {
      if (settled || child.exitCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, options.killGracePeriodMillis ?? 10_000);
      killTimer.unref();
    };
    if (options.signal?.aborted) abortChild();
    else options.signal?.addEventListener("abort", abortChild, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new DatabaseToolError(
          options.code || "DOCKER_UNAVAILABLE",
          `${command} could not start.`,
          options.phase
        )
      );
    });
    child.once("exit", (exitCode) => {
      if (settled) return;
      settled = true;
      cleanup();
      const result = { stdout, stderr, exitCode: exitCode ?? 1 };
      if (options.signal?.aborted) {
        reject(
          new DatabaseToolError(
            options.code || "DOCKER_UNAVAILABLE",
            `${command} was stopped because its controlling session was lost.`,
            options.phase
          )
        );
      } else if (result.exitCode !== 0 && !options.acceptedExitCodes?.includes(result.exitCode)) {
        reject(
          new DatabaseToolError(
            options.code || "DOCKER_UNAVAILABLE",
            `${command} failed with exit code ${result.exitCode}.`,
            options.phase
          )
        );
      } else {
        resolve(result);
      }
    });
  });
}
