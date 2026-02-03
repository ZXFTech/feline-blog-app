import type { PomodoroState } from "@/types/pomodoro";

export function nowMs() {
  return Date.now();
}

export function isBrowser() {
  return typeof window !== "undefined";
}

export function pickSyncSnapshot(s: PomodoroState) {
  return {
    phase: s.phase,
    run: s.run,
    endAt: s.endAt,
    remainingMs: s.remainingMs, // paused/stopped 时需要；running 时主要靠 endAt
    completedFocus: s.completedFocus,
    settings: s.settings,
  };
}

export function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  const aKey = Object.keys(a);
  const bKey = Object.keys(b);
  if (aKey.length !== bKey.length) {
    return false;
  }
  for (const key of aKey) {
    if (!Object.is(a[key as keyof typeof a], b[key as keyof typeof b])) {
      return false;
    }
  }

  return true;
}

export function shouldFireDeduplicate(
  runtime: Map<string, unknown>,
  dedupKey: string,
  key: string,
  windowMs: number,
) {
  const prev = runtime.get(dedupKey) as { key: string; at: number } | undefined;
  const t = nowMs();
  if (prev && prev.key === key && t - prev.at < windowMs) return false;
  runtime.set(dedupKey, { key, at: t });
  return true;
}
