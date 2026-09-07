import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@/lib/pomodoro/reducer";
import type { PluginContext, PomodoroState } from "@/types/pomodoro";
import { tickPlugin } from ".";

describe("tickPlugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks timer ticks with the tick dispatch source", () => {
    const dispatch = vi.fn();
    const state: PomodoroState = {
      ...initialState,
      phase: "focus",
      run: "running",
      endAt: Date.now() + 60_000,
      activeEventId: "event-1",
    };
    const context: PluginContext<PomodoroState> = {
      runtime: new Map(),
      getState: () => state,
      dispatch,
      actions: {
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        skip: vi.fn(),
        setSettings: vi.fn(),
      },
    };

    const plugin = tickPlugin({ intervalMs: 250 });
    const cleanup = plugin.setup?.(context);
    plugin.onStateChange?.(initialState, state, context);
    vi.advanceTimersByTime(250);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "TICK" }), {
      source: "tick",
    });
    cleanup?.();
  });
});
