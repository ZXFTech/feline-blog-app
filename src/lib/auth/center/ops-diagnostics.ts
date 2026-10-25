const stages = [
  'release_input_read', 'release_input_parse', 'release_target_check',
  'release_secret_check', 'auth_safe_sql', 'managed_credential',
  'managed_acquire', 'managed_contract', 'cleanup_summary', 'response_encode',
] as const;
const reasons = [
  'check_rejected', 'file_missing', 'database_target_mismatch',
  'privilege_check_failed', 'database_unavailable', 'connection_failed',
  'contract_rejected', 'binding_mismatch', 'managed_budget_exhausted',
  'ops_budget_exhausted',
] as const;
type Stage = typeof stages[number];
type Reason = typeof reasons[number];
export type OpsDiagnostic = {
  enter(stage: Stage): void;
  reject(reason: Reason): void;
  emitFailure(): void;
  complete(): void;
};

// Created only after the operations request passes all access checks. No error
// objects or request/environment values can enter the emitted record.
export function createOpsDiagnostic(): OpsDiagnostic {
  const startedAt = Date.now();
  let current: Stage = 'release_target_check', sealed = false;
  let failure: {stage: Stage; reason: Reason} | undefined;
  return {
    enter(stage) {
      if (!sealed && !failure && stages.includes(stage)) current = stage;
    },
    reject(reason) {
      if (!sealed && !failure && reasons.includes(reason)) failure = {stage: current, reason};
    },
    emitFailure() {
      if (sealed) return;
      sealed = true;
      const record = failure ?? {stage: current, reason: 'check_rejected'};
      const elapsedMs = Math.max(0, Math.min(60000, Math.trunc(Date.now() - startedAt)));
      try {
        console.info(JSON.stringify({event: 'feline_ops_diagnostic', code: 'OPS_UNAVAILABLE', ...record, elapsedMs}));
      } catch { /* A logging failure must not replace the existing HTTP result. */ }
    },
    complete() { sealed = true; },
  };
}
