import { createHash } from "node:crypto";

export const PHASES = [
  "verify",
  "head-check",
  "checkpoint",
  "migration-reconcile",
  "migrate",
  "capture-previous",
  "deploy",
  "candidate-public-smoke",
  "candidate-auth-smoke",
  "candidate-cleanup",
  "promote",
  "stable-public-smoke",
  "restore",
  "recovery-public-smoke",
  "release-maintenance",
  "release-finalize",
] as const;

export const PHASE_STATES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "superseded",
] as const;

export const FAILURE_CODES = [
  "HEAD_DRIFT",
  "MIGRATION_DIVERGENT",
  "MIGRATION_FAILED",
  "REMOTE_AMBIGUOUS",
  "DEPLOY_TIMEOUT",
  "OIDC_REJECTED",
  "ORIGIN_REJECTED",
  "SMOKE_FAILED",
  "CLEANUP_FAILED",
  "ALIAS_CHANGED",
  "RESTORE_FAILED",
  "RELEASE_DEFERRED",
  "RELEASE_COLLISION",
] as const;

export type Phase = (typeof PHASES)[number];
export type PhaseState = (typeof PHASE_STATES)[number];
export type FailureCode = (typeof FAILURE_CODES)[number];

export interface MigrationFile {
  name: string;
  checksum: string;
  sql?: string;
}

export interface MigrationRow {
  migrationName: string;
  checksum: string;
  finishedAt: string | Date | null;
  rolledBackAt: string | Date | null;
}

export interface MigrationDecision {
  applied: MigrationFile[];
  pending: MigrationFile[];
  rolledBack: string[];
}

export class StagingContractError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string
  ) {
    super(message);
    this.name = "StagingContractError";
  }
}

export function assertFullSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new StagingContractError("HEAD_DRIFT", "Candidate must be a full commit SHA.");
  }
  return normalized;
}

export function stagingRecordKey(candidateSha: string, runId: string, attempt: string): string {
  return `${assertFullSha(candidateSha)}:${assertPositiveInteger(runId)}:${assertPositiveInteger(attempt)}`;
}

function assertPositiveInteger(value: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new StagingContractError("REMOTE_AMBIGUOUS", "Run identity is invalid.");
  }
  return value;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hostHash(url: string): string {
  return sha256(normalizeHttpsOrigin(url).host).slice(0, 16);
}

export function normalizeHttpsOrigin(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new StagingContractError("ORIGIN_REJECTED", "Smoke target must be one HTTPS origin.");
  }
  url.pathname = "";
  return url;
}

export function assertSameOrigin(source: string | URL, target: string | URL): void {
  const sourceOrigin = normalizeHttpsOrigin(source.toString()).origin;
  const targetUrl = new URL(target.toString(), sourceOrigin);
  if (targetUrl.origin !== sourceOrigin) {
    throw new StagingContractError("ORIGIN_REJECTED", "Cross origin request was rejected.");
  }
}

export function reconcileMigrationHistory(
  files: readonly MigrationFile[],
  rows: readonly MigrationRow[]
): MigrationDecision {
  const expected = [...files].sort((left, right) => left.name.localeCompare(right.name));
  const expectedNames = new Set(expected.map((file) => file.name));
  const grouped = new Map<string, MigrationRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.migrationName) ?? [];
    group.push(row);
    grouped.set(row.migrationName, group);
  }

  for (const name of grouped.keys()) {
    if (!expectedNames.has(name)) {
      throw new StagingContractError(
        "MIGRATION_DIVERGENT",
        `Database migration ${name} is absent from the candidate tree.`
      );
    }
  }

  const applied: MigrationFile[] = [];
  const pending: MigrationFile[] = [];
  const rolledBack: string[] = [];
  let pendingSeen = false;

  for (const file of expected) {
    const history = grouped.get(file.name) ?? [];
    const active = history.filter((row) => row.rolledBackAt === null);
    const unfinished = active.filter((row) => row.finishedAt === null);
    const finished = active.filter((row) => row.finishedAt !== null);
    const rolledBackOnly = history.length > 0 && active.length === 0;

    if (unfinished.length > 0) {
      throw new StagingContractError(
        "MIGRATION_FAILED",
        `Migration ${file.name} has an unfinished active attempt.`
      );
    }
    if (finished.length > 1) {
      throw new StagingContractError(
        "MIGRATION_DIVERGENT",
        `Migration ${file.name} has ambiguous active history.`
      );
    }
    if (finished[0] && finished[0].checksum !== file.checksum) {
      throw new StagingContractError(
        "MIGRATION_DIVERGENT",
        `Migration ${file.name} checksum differs from the candidate.`
      );
    }

    if (finished.length === 1) {
      if (pendingSeen) {
        throw new StagingContractError(
          "MIGRATION_DIVERGENT",
          "Applied migrations are not an exact prefix of the candidate history."
        );
      }
      applied.push(file);
      continue;
    }

    pendingSeen = true;
    pending.push(file);
    if (rolledBackOnly) rolledBack.push(file.name);
  }

  return { applied, pending, rolledBack };
}

const UNSAFE_SQL: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bDROP\b/i, reason: "DROP is not forward compatible" },
  { pattern: /\bTRUNCATE\b/i, reason: "TRUNCATE is destructive" },
  { pattern: /\bALTER\s+TABLE\b[\s\S]*\bRENAME\b/i, reason: "direct rename is unsafe" },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+(?:COLUMN|CONSTRAINT)\b/i,
    reason: "dropping schema is unsafe",
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*\bALTER\s+COLUMN\b[\s\S]*\bTYPE\b/i,
    reason: "type changes require review",
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i,
    reason: "new required constraints need a separately verified backfill",
  },
  { pattern: /\bEXECUTE\b|\bEXEC\b/i, reason: "dynamic SQL cannot be classified" },
  { pattern: /\bDO\s+\$/i, reason: "procedural blocks cannot be classified" },
  {
    pattern: /\bDELETE\s+FROM\b|\bUPDATE\b[\s\S]*\bSET\b/i,
    reason: "data rewrites require a separate design",
  },
];

export function assertSafeMigrationSql(sql: string, migrationName: string): void {
  const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
  if (/\$[A-Za-z0-9_]*\$/.test(withoutComments)) {
    throw new StagingContractError(
      "MIGRATION_DIVERGENT",
      `Migration ${migrationName} contains an unclassified dollar quoted block.`
    );
  }
  for (const rule of UNSAFE_SQL) {
    if (rule.pattern.test(withoutComments)) {
      throw new StagingContractError(
        "MIGRATION_DIVERGENT",
        `Migration ${migrationName} rejected: ${rule.reason}.`
      );
    }
  }
}

export interface DeploymentIdentity {
  deploymentId: string;
  commitSha: string;
  hostHash: string;
}

export interface StagingCheckpoint {
  schemaVersion: 1;
  recordKey: string;
  candidateSha: string;
  runId: string;
  attempt: string;
  phaseStates: Record<Phase, PhaseState>;
  migrations: Array<{ name: string; checksumPrefix: string; state: "applied" | "pending" }>;
  previous: DeploymentIdentity | null;
  candidate: DeploymentIdentity | null;
  stable: DeploymentIdentity | null;
  cleanup: { currentRunDeleted: number; orphanDeleted: number; status: PhaseState };
  promote: { status: PhaseState };
  recovery: { status: PhaseState };
  release: { status: PhaseState };
  failureCode: FailureCode | null;
}

export function createCheckpoint(input: {
  candidateSha: string;
  runId: string;
  attempt: string;
}): StagingCheckpoint {
  const candidateSha = assertFullSha(input.candidateSha);
  return {
    schemaVersion: 1,
    recordKey: stagingRecordKey(candidateSha, input.runId, input.attempt),
    candidateSha,
    runId: assertPositiveInteger(input.runId),
    attempt: assertPositiveInteger(input.attempt),
    phaseStates: Object.fromEntries(PHASES.map((phase) => [phase, "pending"])) as Record<
      Phase,
      PhaseState
    >,
    migrations: [],
    previous: null,
    candidate: null,
    stable: null,
    cleanup: { currentRunDeleted: 0, orphanDeleted: 0, status: "pending" },
    promote: { status: "pending" },
    recovery: { status: "pending" },
    release: { status: "pending" },
    failureCode: null,
  };
}

const SECRET_KEY =
  /(token|secret|password|cookie|authorization|database[_-]?url|certificate|private[_-]?key)/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SECRET_KEY.test(key) ? "[redacted]" : redactSecrets(nested),
      ])
    );
  }
  if (typeof value === "string") {
    return value
      .replace(/(?:postgres(?:ql)?):\/\/[^\s]+/gi, "[redacted-database-url]")
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
  }
  return value;
}

export function selectCorrelatedDeployment<T>(matches: readonly T[]): T | null {
  if (matches.length > 1) {
    throw new StagingContractError(
      "REMOTE_AMBIGUOUS",
      "More than one remote deployment matches the record key."
    );
  }
  return matches[0] ?? null;
}

export function canRestoreAlias(currentDeploymentId: string, candidateDeploymentId: string): true {
  if (currentDeploymentId !== candidateDeploymentId) {
    throw new StagingContractError(
      "ALIAS_CHANGED",
      "Stable alias changed outside this staging run."
    );
  }
  return true;
}
