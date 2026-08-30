import type { PomodoroOutboxItem, PomodoroState, PomodoroTimerEnvelope } from '@/types/pomodoro';

const TIMER_PREFIX = 'pomodoro:v2:timer:';
const OUTBOX_PREFIX = 'pomodoro:v2:outbox:';
const QUARANTINE_PREFIX = 'pomodoro:v2:quarantine:';

export const timerKey = (userId: string) => `${TIMER_PREFIX}${userId}`;
export const outboxKey = (userId: string, eventId: string) =>
  `${OUTBOX_PREFIX}${userId}:${eventId}`;

export function probePomodoroStorage() {
  const key = 'pomodoro:v2:probe';
  localStorage.setItem(key, '1');
  localStorage.removeItem(key);
}

function quarantine(userId: string, raw: string) {
  try {
    localStorage.setItem(`${QUARANTINE_PREFIX}${userId}:${Date.now()}`, raw);
  } catch {
    // The caller already reports that storage is unavailable.
  }
}

function validState(value: unknown): value is PomodoroState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PomodoroState>;
  return (
    typeof state.remainingMs === 'number' &&
    typeof state.completedFocus === 'number' &&
    typeof state.settings === 'object' &&
    state.settings !== null &&
    ['idle', 'focus', 'short_break', 'long_break'].includes(String(state.phase)) &&
    ['stopped', 'running', 'paused'].includes(String(state.run))
  );
}

export function readTimer(userId: string): {
  state: PomodoroState | null;
  recovered: boolean;
} {
  const raw = localStorage.getItem(timerKey(userId));
  if (!raw) return { state: null, recovered: false };
  try {
    const envelope = JSON.parse(raw) as Partial<PomodoroTimerEnvelope>;
    if (envelope.schemaVersion !== 2 || envelope.userId !== userId || !validState(envelope.state))
      throw new Error('invalid timer');
    return { state: envelope.state, recovered: false };
  } catch {
    quarantine(userId, raw);
    localStorage.removeItem(timerKey(userId));
    return { state: null, recovered: true };
  }
}

export function writeTimer(userId: string, state: PomodoroState) {
  const envelope: PomodoroTimerEnvelope = { schemaVersion: 2, userId, state };
  localStorage.setItem(timerKey(userId), JSON.stringify(envelope));
}

export function writeOutbox(item: PomodoroOutboxItem) {
  localStorage.setItem(outboxKey(item.userId, item.eventId), JSON.stringify(item));
}

export function removeOutbox(userId: string, eventId: string) {
  localStorage.removeItem(outboxKey(userId, eventId));
}

export function readOutbox(userId: string): PomodoroOutboxItem[] {
  const prefix = `${OUTBOX_PREFIX}${userId}:`;
  const items: PomodoroOutboxItem[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const item = JSON.parse(raw) as PomodoroOutboxItem;
      if (
        item.schemaVersion !== 2 ||
        item.userId !== userId ||
        !item.eventId ||
        item.payload.eventId !== item.eventId
      )
        throw new Error('invalid outbox');
      items.push(item);
    } catch {
      quarantine(userId, raw);
      localStorage.removeItem(key);
    }
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function toLocalHistory(item: PomodoroOutboxItem) {
  const target = item.payload.targetDurationMs;
  return {
    id: `local:${item.eventId}`,
    eventId: item.eventId,
    type: item.payload.type,
    endReason: item.payload.endReason,
    finished: item.payload.endReason === 'COMPLETED',
    startAt: item.payload.startAt,
    endAt: item.payload.endAt,
    durationMs: target,
    actualDurationMs: target - item.payload.remainingMs,
    syncStatus: item.status,
    lastError: item.lastError,
  } as const;
}

export function retryDelayMs(retryCount: number) {
  return Math.min(300_000, 1000 * 2 ** Math.max(0, retryCount));
}
