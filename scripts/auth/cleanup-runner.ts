type Counts = { flows: number; sessions: number; browsers: number; rates: number };
type Batch = Counts & { pending: boolean };
type Query = (sql: string, values: number[]) => Promise<{ rows: { result: unknown }[] }>;
const keys = ["flows", "sessions", "browsers", "rates"] as const;
function batchResult(value: unknown): Batch {
  if (!value || typeof value !== "object") throw new Error("INVALID_CLEANUP_RESULT");
  const row = value as Record<string, unknown>;
  if (typeof row.pending !== "boolean" || keys.some(key => !Number.isSafeInteger(row[key]) || (row[key] as number) < 0)) throw new Error("INVALID_CLEANUP_RESULT");
  return row as Batch;
}
export async function drainAuthRows(query: Query, { maxBatches = 500, maxDurationMs = 30000, now = () => performance.now() } = {}) {
  const removed: Counts = { flows: 0, sessions: 0, browsers: 0, rates: 0 };
  const started = now();
  let batches = 0;
  while (batches < maxBatches && now() - started < maxDurationMs) {
    const result = batchResult((await query("SELECT public.cleanup_auth_rows($1) AS result", [100])).rows[0]?.result);
    batches++;
    for (const key of keys) removed[key] += result[key];
    if (!result.pending) return { removed, batches, pending: false, success: true, reason: "complete" as const };
    if (keys.every(key => result[key] === 0)) return { removed, batches, pending: true, success: false, reason: "stalled" as const };
  }
  return { removed, batches, pending: true, success: false, reason: "budget" as const };
}
