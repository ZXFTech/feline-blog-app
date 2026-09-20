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
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", () => {
      reject(
        new DatabaseToolError(
          options.code || "DOCKER_UNAVAILABLE",
          `${command} could not start.`,
          options.phase
        )
      );
    });
    child.once("exit", (exitCode) => {
      const result = { stdout, stderr, exitCode: exitCode ?? 1 };
      if (result.exitCode !== 0) {
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
