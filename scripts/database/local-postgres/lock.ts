import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DatabaseToolError } from "./errors";
import { repositoryRoot, targets } from "./config";

export interface LockRecord {
  ownerToken: string;
  pid: number;
  processStartedAt: number;
  dockerEndpoint: string;
  composeProject: string;
  worktree: string;
  operation: string;
  heartbeat: string;
}

function quoteForShell(value: string): string {
  return process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", `'\\''`)}'`;
}

export function hostLockInspectionSummary(lockPath: string, existing: Partial<LockRecord>): string {
  const quotedPath = quoteForShell(lockPath);
  const processCommand =
    typeof existing.pid === "number"
      ? process.platform === "win32"
        ? `Get-Process -Id ${existing.pid} -ErrorAction SilentlyContinue`
        : `ps -p ${existing.pid} -o pid=,lstart=,command=`
      : process.platform === "win32"
        ? "Get-Process"
        : "ps -ef";
  const lockCommand =
    process.platform === "win32"
      ? `Get-Content -Raw -LiteralPath ${quotedPath}`
      : `cat ${quotedPath}`;
  return `Inspect the lock with: ${lockCommand}. Inspect the recorded process with: ${processCommand}. Compare the process creation identity, Docker endpoint, Compose project, worktree, child processes, and database ledger before changing the lock.`;
}

function lockRoot(): string {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA;
    if (!base) throw new DatabaseToolError("CONFIG_CONFLICT", "LOCALAPPDATA is required.");
    return path.join(base, "feline-blog", "locks");
  }
  return path.join(
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
    "feline-blog",
    "locks"
  );
}

export async function withHostLock<T>(operation: string, action: () => Promise<T>): Promise<T> {
  const directory = lockRoot();
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, `${targets.composeProject}.lock`);
  const ownerToken = randomUUID();
  const record: LockRecord = {
    ownerToken,
    pid: process.pid,
    processStartedAt: Date.now() - Math.round(process.uptime() * 1000),
    dockerEndpoint: process.env.DOCKER_HOST || "default",
    composeProject: targets.composeProject,
    worktree: repositoryRoot,
    operation,
    heartbeat: new Date().toISOString(),
  };
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(JSON.stringify(record));
  } catch {
    let owner = "unknown";
    let inspection = hostLockInspectionSummary(lockPath, {});
    try {
      const existing = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockRecord>;
      owner = `${existing.operation || "unknown"} pid ${existing.pid || "unknown"}`;
      inspection = hostLockInspectionSummary(lockPath, existing);
    } catch {
      // The lock is deliberately not broken when ownership is uncertain.
    }
    throw new DatabaseToolError(
      "OWNERSHIP_AMBIGUOUS",
      `The local database lock is held by ${owner}. ${inspection}`
    );
  }
  const heartbeat = setInterval(() => {
    record.heartbeat = new Date().toISOString();
    void writeFile(lockPath, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
  }, 5_000);
  heartbeat.unref();
  try {
    return await action();
  } finally {
    clearInterval(heartbeat);
    await handle.close();
    try {
      const current = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockRecord>;
      if (current.ownerToken === ownerToken) await rm(lockPath, { force: true });
    } catch {
      // A missing lock is already released.
    }
  }
}
