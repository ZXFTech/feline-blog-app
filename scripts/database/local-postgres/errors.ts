export type DatabaseErrorCode =
  | "CONFIG_CONFLICT"
  | "TARGET_REJECTED"
  | "DOCKER_UNAVAILABLE"
  | "ROLE_MISMATCH"
  | "MIGRATION_DRIFT"
  | "SNAPSHOT_FAILED"
  | "RESTORE_FAILED"
  | "ACTIVE_CONNECTIONS"
  | "RECOVERY_REQUIRED"
  | "OWNERSHIP_AMBIGUOUS";

export class DatabaseToolError extends Error {
  constructor(
    readonly code: DatabaseErrorCode,
    message: string,
    readonly phase?: string
  ) {
    super(message);
    this.name = "DatabaseToolError";
  }
}

export function safeFailure(error: unknown): {
  ok: false;
  code: DatabaseErrorCode;
  summary: string;
  phase?: string;
} {
  if (error instanceof DatabaseToolError) {
    return {
      ok: false,
      code: error.code,
      summary: error.message,
      ...(error.phase ? { phase: error.phase } : {}),
    };
  }
  return {
    ok: false,
    code: "CONFIG_CONFLICT",
    summary:
      "The database command failed. Run it again after checking the documented configuration.",
  };
}
