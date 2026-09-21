import { chmod, link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isProtectedKey, stateDirectory, targets } from "./config";
import { DatabaseToolError } from "./errors";
import { runCommand } from "./process";

export interface TimeoutExplicitState {
  lockTimeout: string | null;
  statementTimeout: string | null;
}

export interface TimeoutEffectiveState {
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

export interface StagingMigratorTimeoutPrestate {
  schemaVersion: 1;
  projectRef: string;
  database: string;
  role: string;
  capturedAt: string;
  explicit: TimeoutExplicitState;
  effectiveMs: TimeoutEffectiveState;
}

export type TimeoutTransition = "apply" | "verify";

export const timeoutPrestatePath = path.join(
  stateDirectory,
  "staging-migrator-timeouts-prestate.json"
);

const timeoutUnits: Readonly<Record<string, number>> = {
  us: 0.001,
  ms: 1,
  s: 1_000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function configError(summary: string): DatabaseToolError {
  return new DatabaseToolError("CONFIG_CONFLICT", summary);
}

export function parseTimeoutMilliseconds(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(us|ms|s|min|h|d)?$/i.exec(value.trim());
  if (!match) throw configError("A staging migrator timeout value is not allowlisted.");
  const amount = Number(match[1]);
  const multiplier = timeoutUnits[(match[2] || "ms").toLowerCase()];
  const milliseconds = amount * multiplier;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw configError("A staging migrator timeout value cannot be represented in milliseconds.");
  }
  return milliseconds;
}

export function desiredTimeoutExplicitState(): TimeoutExplicitState {
  return {
    lockTimeout: `${targets.stagingMigrationLockTimeoutMs}ms`,
    statementTimeout: `${targets.stagingMigrationStatementTimeoutMs}ms`,
  };
}

export function desiredTimeoutEffectiveState(): TimeoutEffectiveState {
  return {
    lockTimeoutMs: targets.stagingMigrationLockTimeoutMs,
    statementTimeoutMs: targets.stagingMigrationStatementTimeoutMs,
  };
}

function timeoutValueMatches(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return parseTimeoutMilliseconds(left) === parseTimeoutMilliseconds(right);
}

export function explicitTimeoutStatesMatch(
  left: TimeoutExplicitState,
  right: TimeoutExplicitState
): boolean {
  return (
    timeoutValueMatches(left.lockTimeout, right.lockTimeout) &&
    timeoutValueMatches(left.statementTimeout, right.statementTimeout)
  );
}

export function effectiveTimeoutStatesMatch(
  left: TimeoutEffectiveState,
  right: TimeoutEffectiveState
): boolean {
  return (
    left.lockTimeoutMs === right.lockTimeoutMs &&
    left.statementTimeoutMs === right.statementTimeoutMs
  );
}

export function decideConfigureTimeoutTransition(
  current: TimeoutExplicitState,
  prestate: TimeoutExplicitState
): TimeoutTransition {
  if (explicitTimeoutStatesMatch(current, desiredTimeoutExplicitState())) return "verify";
  if (explicitTimeoutStatesMatch(current, prestate)) return "apply";
  throw configError("The staging migrator timeout role defaults have drifted.");
}

export function decideRollbackTimeoutTransition(
  current: TimeoutExplicitState,
  prestate: TimeoutExplicitState
): TimeoutTransition {
  if (explicitTimeoutStatesMatch(current, prestate)) return "verify";
  if (explicitTimeoutStatesMatch(current, desiredTimeoutExplicitState())) return "apply";
  throw configError("The staging migrator timeout role defaults have drifted.");
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw configError("The staging migrator timeout prestate has an unexpected shape.");
  }
}

function parseExplicitState(value: unknown): TimeoutExplicitState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw configError("The staging migrator timeout prestate explicit values are invalid.");
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, ["lockTimeout", "statementTimeout"]);
  for (const key of ["lockTimeout", "statementTimeout"] as const) {
    const item = record[key];
    if (item !== null && typeof item !== "string") {
      throw configError("The staging migrator timeout prestate explicit values are invalid.");
    }
    if (typeof item === "string") parseTimeoutMilliseconds(item);
  }
  return {
    lockTimeout: record.lockTimeout as string | null,
    statementTimeout: record.statementTimeout as string | null,
  };
}

function parseEffectiveState(value: unknown): TimeoutEffectiveState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw configError("The staging migrator timeout prestate effective values are invalid.");
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, ["lockTimeoutMs", "statementTimeoutMs"]);
  if (
    !Number.isSafeInteger(record.lockTimeoutMs) ||
    Number(record.lockTimeoutMs) < 0 ||
    !Number.isSafeInteger(record.statementTimeoutMs) ||
    Number(record.statementTimeoutMs) < 0
  ) {
    throw configError("The staging migrator timeout prestate effective values are invalid.");
  }
  return {
    lockTimeoutMs: Number(record.lockTimeoutMs),
    statementTimeoutMs: Number(record.statementTimeoutMs),
  };
}

export function parseTimeoutPrestate(contents: string): StagingMigratorTimeoutPrestate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw configError("The staging migrator timeout prestate is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw configError("The staging migrator timeout prestate is invalid.");
  }
  const record = parsed as Record<string, unknown>;
  assertExactKeys(record, [
    "schemaVersion",
    "projectRef",
    "database",
    "role",
    "capturedAt",
    "explicit",
    "effectiveMs",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.projectRef !== targets.stagingProjectRef ||
    record.database !== targets.stagingDatabase ||
    record.role !== targets.migratorRole ||
    typeof record.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(record.capturedAt))
  ) {
    throw configError("The staging migrator timeout prestate target is not allowlisted.");
  }
  return {
    schemaVersion: 1,
    projectRef: targets.stagingProjectRef,
    database: targets.stagingDatabase,
    role: targets.migratorRole,
    capturedAt: record.capturedAt,
    explicit: parseExplicitState(record.explicit),
    effectiveMs: parseEffectiveState(record.effectiveMs),
  };
}

async function windowsAclContext(filePath: string): Promise<{
  childEnvironment: NodeJS.ProcessEnv;
  currentSid: string;
  systemRoot: string;
}> {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!systemRoot) throw configError("Windows cannot locate PowerShell for prestate ACL setup.");
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  const childEnvironment: NodeJS.ProcessEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !isProtectedKey(key))),
    NODE_ENV: process.env.NODE_ENV,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    PATH: process.env.PATH,
    PSModulePath: [
      path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules"),
      process.env.PSModulePath,
    ]
      .filter(Boolean)
      .join(";"),
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
    FELINE_PRESTATE_PATH: filePath,
  };
  let currentSid: string;
  try {
    const identity = await runCommand(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
      ],
      {
        env: childEnvironment,
        code: "CONFIG_CONFLICT",
        phase: "staging-migrator-timeout-acl",
      }
    );
    currentSid = identity.stdout.trim();
    if (!/^S-\d(?:-\d+)+$/.test(currentSid)) {
      throw configError("The current Windows identity is not allowlisted for the prestate ACL.");
    }
  } catch {
    throw configError("The Windows identity for the prestate ACL could not be verified.");
  }
  return { childEnvironment, currentSid, systemRoot };
}

async function verifyWindowsFile(filePath: string): Promise<void> {
  const { childEnvironment, currentSid, systemRoot } = await windowsAclContext(filePath);
  const aclDumpPath = `${filePath}.${process.pid}.acl.tmp`;
  try {
    const icacls = path.join(systemRoot, "System32", "icacls.exe");
    await runCommand(icacls, [filePath, "/save", aclDumpPath, "/c"], {
      env: childEnvironment,
      code: "CONFIG_CONFLICT",
      phase: "staging-migrator-timeout-acl",
    });
    const dump = (await readFile(aclDumpPath)).toString("utf16le").replace(/^\uFEFF/, "");
    const descriptor = dump
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map((line) => line.slice(Math.max(0, line.indexOf("D:"))))
      .find((line) => line.startsWith("D:"));
    if (!descriptor || !/^D:[A-Z]*P[A-Z]*/.test(descriptor)) {
      throw configError("The staging migrator timeout prestate ACL is not private.");
    }
    const trustees = [...descriptor.matchAll(/\(([^)]*)\)/g)].map((match) => {
      const fields = match[1]?.split(";") || [];
      if (fields[0] !== "A" || fields[2] !== "FA") {
        throw configError("The staging migrator timeout prestate ACL is not private.");
      }
      return fields.at(-1);
    });
    const expected = [currentSid, "SY"].sort();
    if (
      trustees.some((item) => typeof item !== "string") ||
      trustees.map(String).sort().join("|") !== expected.join("|")
    ) {
      throw configError("The staging migrator timeout prestate ACL is not private.");
    }
  } catch (error) {
    if (
      error instanceof DatabaseToolError &&
      error.message === "The staging migrator timeout prestate ACL is not private."
    ) {
      throw error;
    }
    throw configError("The staging migrator timeout prestate ACL could not be verified.");
  } finally {
    await rm(aclDumpPath, { force: true });
  }
}

async function secureWindowsFile(filePath: string): Promise<void> {
  const { childEnvironment, currentSid, systemRoot } = await windowsAclContext(filePath);
  try {
    const icacls = path.join(systemRoot, "System32", "icacls.exe");
    await runCommand(
      icacls,
      [filePath, "/inheritance:r", "/grant:r", `*${currentSid}:(F)`, "*S-1-5-18:(F)"],
      {
        env: childEnvironment,
        code: "CONFIG_CONFLICT",
        phase: "staging-migrator-timeout-acl",
      }
    );
  } catch {
    throw configError("The staging migrator timeout prestate ACL could not be set.");
  }
  await verifyWindowsFile(filePath);
}

export async function assertPrivatePrestateFile(filePath: string): Promise<void> {
  if (process.platform === "win32") {
    await verifyWindowsFile(filePath);
    return;
  }
  const details = await stat(filePath);
  if ((details.mode & 0o077) !== 0) {
    throw configError("The staging migrator timeout prestate permissions are not private.");
  }
}

export async function securePrivatePrestateFile(filePath: string): Promise<void> {
  if (process.platform === "win32") await secureWindowsFile(filePath);
  else await chmod(filePath, 0o600);
  await assertPrivatePrestateFile(filePath);
}

export async function readTimeoutPrestate(): Promise<StagingMigratorTimeoutPrestate | undefined> {
  try {
    await stat(timeoutPrestatePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  await assertPrivatePrestateFile(timeoutPrestatePath);
  const contents = await readFile(timeoutPrestatePath, "utf8");
  return parseTimeoutPrestate(contents);
}

export async function writeTimeoutPrestate(
  prestate: StagingMigratorTimeoutPrestate
): Promise<void> {
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(stateDirectory, 0o700);
  const temporaryPath = `${timeoutPrestatePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(prestate, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await securePrivatePrestateFile(temporaryPath);
    await link(temporaryPath, timeoutPrestatePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw configError("The staging migrator timeout prestate already exists.");
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function archiveTimeoutPrestate(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[^0-9A-Z]/gi, "");
  const archivePath = path.join(
    stateDirectory,
    `staging-migrator-timeouts-prestate.${timestamp}.rolled-back.json`
  );
  await rename(timeoutPrestatePath, archivePath);
  await assertPrivatePrestateFile(archivePath);
  return archivePath;
}
