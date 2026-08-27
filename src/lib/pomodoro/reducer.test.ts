import { describe, expect, it } from "vitest";
import {
  PomodoroEndReason,
  PomodoroType,
} from "../../../generated/prisma/enums";
import {
  defaultSettings,
  durationMsFor,
  initialState,
  pomodoroReducer,
} from "./reducer";

const eventId = "019d3b54-2e18-7000-8000-000000000001";

describe("pomodoroReducer", () => {
  it("AC-1 starts a focus with a stable event and current duration", () => {
    const state = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });

    expect(state).toMatchObject({
      phase: "focus",
      run: "running",
      activeEventId: eventId,
      startAt: 1_000,
      endAt: 1_501_000,
      remainingMs: 1_500_000,
    });
  });

  it("AC-1 keeps the first start time and paused remainder when resuming", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const paused = pomodoroReducer(running, { type: "PAUSE", now: 11_000 });
    const resumed = pomodoroReducer(paused, { type: "RESUME", now: 21_000 });

    expect(paused.remainingMs).toBe(1_490_000);
    expect(resumed.startAt).toBe(1_000);
    expect(resumed.endAt).toBe(1_511_000);
  });

  it("AC-1 completes at the planned deadline and advances to a stopped short break", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const completed = pomodoroReducer(running, {
      type: "TICK",
      now: 1_501_500,
    });

    expect(completed).toMatchObject({
      phase: "short_break",
      run: "stopped",
      completedFocus: 1,
    });
    expect(completed.pendingOutcome).toEqual({
      eventId,
      type: PomodoroType.FOCUS,
      endReason: PomodoroEndReason.COMPLETED,
      startAt: new Date(1_000).toISOString(),
      endAt: new Date(1_501_000).toISOString(),
      targetDurationMs: 1_500_000,
      remainingMs: 0,
    });
  });

  it("AC-1 gives completion priority to stop at the exact deadline", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const stopped = pomodoroReducer(running, { type: "STOP", now: 1_501_000 });

    expect(stopped.pendingOutcome?.endReason).toBe(PomodoroEndReason.COMPLETED);
    expect(stopped.phase).toBe("short_break");
  });

  it("AC-1 records an early skip at the operation time", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const skipped = pomodoroReducer(running, { type: "SKIP", now: 11_000 });

    expect(skipped.pendingOutcome).toMatchObject({
      endReason: PomodoroEndReason.SKIPPED,
      endAt: new Date(11_000).toISOString(),
      remainingMs: 1_490_000,
    });
  });

  it("AC-1 records an early stop at the operation time and returns to idle", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const stopped = pomodoroReducer(running, { type: "STOP", now: 11_000 });

    expect(stopped).toMatchObject({
      phase: "idle",
      run: "stopped",
      activeEventId: null,
    });
    expect(stopped.pendingOutcome).toMatchObject({
      endReason: PomodoroEndReason.STOPPED,
      endAt: new Date(11_000).toISOString(),
      remainingMs: 1_490_000,
    });
  });

  it.each([
    ["short_break" as const, PomodoroType.SHORT],
    ["long_break" as const, PomodoroType.LONG],
  ])("AC-1 completes the %s phase at its planned deadline", (phase, type) => {
    const phaseState = {
      ...initialState,
      phase,
      remainingMs: durationMsFor(phase, defaultSettings),
    };
    const running = pomodoroReducer(phaseState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const completed = pomodoroReducer(running, {
      type: "TICK",
      now: running.endAt!,
    });

    expect(completed).toMatchObject({
      phase: "focus",
      run: "stopped",
      completedFocus: 0,
    });
    expect(completed.pendingOutcome).toMatchObject({
      type,
      endReason: PomodoroEndReason.COMPLETED,
      endAt: new Date(running.endAt!).toISOString(),
      remainingMs: 0,
    });
  });

  it("AC-3 restores one expired phase without starting another", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const restored = pomodoroReducer(initialState, {
      type: "HYDRATE",
      now: 2_000_000,
      state: running,
    });

    expect(restored).toMatchObject({
      phase: "short_break",
      run: "stopped",
      completedFocus: 1,
    });
    expect(restored.pendingOutcome?.eventId).toBe(eventId);
  });

  it("AC-3 chooses a long break after the configured focus count", () => {
    const configured = {
      ...initialState,
      completedFocus: 1,
      settings: { ...defaultSettings, longBreakEvery: 2 },
    };
    const running = pomodoroReducer(configured, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const completed = pomodoroReducer(running, {
      type: "TICK",
      now: 1_501_000,
    });

    expect(completed.phase).toBe("long_break");
    expect(completed.remainingMs).toBe(
      durationMsFor("long_break", configured.settings),
    );
  });

  it("AC-8 blocks a new start until the pending outcome is acknowledged", () => {
    const running = pomodoroReducer(initialState, {
      type: "START",
      now: 1_000,
      eventId,
    });
    const completed = pomodoroReducer(running, {
      type: "TICK",
      now: 1_501_000,
    });

    expect(
      pomodoroReducer(completed, {
        type: "START",
        now: 2_000_000,
        eventId: "019d3b54-2e18-7000-8000-000000000002",
      }),
    ).toBe(completed);
    expect(
      pomodoroReducer(completed, { type: "ACK_OUTCOME", eventId })
        .pendingOutcome,
    ).toBeNull();
  });
});
