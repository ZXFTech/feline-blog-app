import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PomodoroEndReason,
  PomodoroType,
} from "../../../generated/prisma/enums";
import type { PomodoroOutboxItem, PomodoroState } from "@/types/pomodoro";
import { initialState } from "./reducer";
import {
  outboxKey,
  readOutbox,
  readTimer,
  retryDelayMs,
  timerKey,
  toLocalHistory,
  writeOutbox,
  writeTimer,
} from "./storage";

const userId = "user-a";
const eventId = "019d3b54-2e18-7000-8000-000000000001";

function outbox(
  overrides: Partial<PomodoroOutboxItem> = {},
): PomodoroOutboxItem {
  return {
    schemaVersion: 2,
    userId,
    eventId,
    payload: {
      eventId,
      type: PomodoroType.FOCUS,
      endReason: PomodoroEndReason.COMPLETED,
      startAt: "2026-08-01T00:00:00.000Z",
      endAt: "2026-08-01T00:25:00.000Z",
      targetDurationMs: 1_500_000,
      remainingMs: 0,
    },
    createdAt: "2026-08-01T00:25:00.000Z",
    retryCount: 0,
    nextAttemptAt: 0,
    lastError: null,
    status: "pending",
    ...overrides,
  };
}

describe("pomodoro storage", () => {
  beforeEach(() => localStorage.clear());

  it("AC-7 stores and restores timers by authenticated user", () => {
    const state: PomodoroState = { ...initialState, phase: "focus" };
    writeTimer(userId, state);

    expect(readTimer(userId)).toEqual({ state, recovered: false });
    expect(readTimer("user-b")).toEqual({ state: null, recovered: false });
  });

  it("AC-8 quarantines corrupt timer data and recovers to empty", () => {
    localStorage.setItem(timerKey(userId), "not json");

    expect(readTimer(userId)).toEqual({ state: null, recovered: true });
    expect(localStorage.getItem(timerKey(userId))).toBeNull();
    expect(
      [...Array(localStorage.length)].map((_, index) =>
        localStorage.key(index),
      ),
    ).toEqual([expect.stringMatching(/^pomodoro:v2:quarantine:user-a:/)]);
  });

  it("AC-8 quarantines unsupported timer versions", () => {
    localStorage.setItem(
      timerKey(userId),
      JSON.stringify({ schemaVersion: 1, userId, state: initialState }),
    );

    expect(readTimer(userId).recovered).toBe(true);
  });

  it("AC-4 keeps independent outbox events and sorts them by creation time", () => {
    const later = outbox({
      eventId: "019d3b54-2e18-7000-8000-000000000002",
      payload: {
        ...outbox().payload,
        eventId: "019d3b54-2e18-7000-8000-000000000002",
      },
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    writeOutbox(later);
    writeOutbox(outbox());

    expect(readOutbox(userId).map((item) => item.eventId)).toEqual([
      eventId,
      later.eventId,
    ]);
    expect(localStorage.getItem(outboxKey(userId, eventId))).not.toBeNull();
  });

  it("AC-7 never returns another user's queued event", () => {
    writeOutbox(outbox({ userId: "user-b" }));

    expect(readOutbox(userId)).toEqual([]);
  });

  it("AC-4 converts a queued result into immediately visible history", () => {
    expect(toLocalHistory(outbox({ status: "failed" }))).toMatchObject({
      id: `local:${eventId}`,
      eventId,
      finished: true,
      actualDurationMs: 1_500_000,
      syncStatus: "failed",
    });
  });

  it("AC-4 applies exponential retry from one second and caps it at five minutes", () => {
    expect([0, 1, 2, 8, 30].map(retryDelayMs)).toEqual([
      1_000, 2_000, 4_000, 256_000, 300_000,
    ]);
  });

  it("AC-8 surfaces local storage write failures", () => {
    const failure = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });

    expect(() => writeTimer(userId, initialState)).toThrow("full");
    failure.mockRestore();
  });
});
