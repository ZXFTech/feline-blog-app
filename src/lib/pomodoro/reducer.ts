import {
  Action,
  PomodoroState,
  PomodoroSettings,
  TimerKind,
} from "@/types/pomodoro";

const ms = (min: number) => Math.max(0, Math.round(min * 60_000));

export const defaultSettings: PomodoroSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartNext: false,
  mute: false,
  volume: 0.5,
};

export const initialState: PomodoroState = {
  phase: "idle",
  run: "stopped",
  remainingMs: ms(defaultSettings.focusMin),
  startAt: null,
  endAt: null,
  completedFocus: 0,
  settings: defaultSettings,
};

export function durationMsFor(phase: TimerKind, s: PomodoroSettings) {
  switch (phase) {
    case "focus":
      return ms(s.focusMin);
    case "short_break":
      return ms(s.shortBreakMin);
    case "long_break":
      return ms(s.longBreakMin);
  }
}

function nextPhaseAfterFocus(
  completedFocus: number,
  s: PomodoroSettings,
): TimerKind {
  const shouldLong =
    s.longBreakEvery > 0 && completedFocus % s.longBreakEvery === 0;
  return shouldLong ? "long_break" : "short_break";
}

function nextPhaseFrom(state: PomodoroState): TimerKind {
  // idle => focus
  // focus => "long_break" || "short_break"
  // break => focus
  if (state.phase === "idle") return "focus";
  if (state.phase === "focus")
    return nextPhaseAfterFocus(state.completedFocus + 1, state.settings);
  // break -> focus
  return "focus";
}

function stopRunning(state: PomodoroState): PomodoroState {
  return { ...state, run: "stopped", endAt: null };
}

function startRunning(state: PomodoroState, now: number): PomodoroState {
  return {
    ...state,
    run: "running",
    endAt: now + state.remainingMs,
  };
}

function computeRemaining(endAt: number, now: number) {
  return Math.max(0, endAt - now);
}

export function pomodoroReducer(
  state: PomodoroState,
  action: Action,
): PomodoroState {
  switch (action.type) {
    case "HYDRATE": {
      // 恢复时如果还在 running：用 endAt 纠正 remaining
      const hydrated = action.state;
      if (hydrated.run === "running" && hydrated.endAt) {
        const remainingMs = computeRemaining(hydrated.endAt, action.now);
        // 如果已经过期，直接按 TICK 的逻辑推进一次
        return pomodoroReducer(
          { ...hydrated, remainingMs },
          { type: "TICK", now: action.now },
        );
      }
      return hydrated;
    }

    case "SET_SETTINGS": {
      const settings = { ...state.settings, ...action.settings };
      // 如果当前处于 stopped/idle，可选择同步更新 remaining（更符合用户预期）
      if (state.run !== "running") {
        const phase: TimerKind =
          state.phase === "idle" ? "focus" : (state.phase as TimerKind);
        return {
          ...state,
          settings,
          remainingMs: durationMsFor(phase, settings),
          endAt: null,
        };
      }
      return { ...state, settings };
    }

    case "START": {
      const phase: TimerKind =
        state.phase === "idle" ? "focus" : (state.phase as TimerKind);
      const remainingMs =
        state.run === "paused"
          ? state.remainingMs
          : durationMsFor(phase, state.settings);
      return startRunning(
        { ...state, phase, remainingMs, startAt: action.now },
        action.now,
      );
    }

    case "PAUSE": {
      if (state.run !== "running" || !state.endAt) return state;
      return {
        ...state,
        run: "paused",
        remainingMs: computeRemaining(state.endAt, action.now),
        endAt: null,
      };
    }

    case "RESUME": {
      if (state.run !== "paused") return state;
      return startRunning(state, action.now);
    }

    case "STOP": {
      // 回到 idle，并重置 focus 时长
      return {
        ...state,
        phase: "idle",
        run: "stopped",
        remainingMs: durationMsFor("focus", state.settings),
        endAt: null,
        startAt: null,
      };
    }

    case "SKIP": {
      const next = nextPhaseFrom(state);
      const nextRemaining = durationMsFor(next, state.settings);

      // focus -> break 时才累计 completedFocus
      const completedFocus =
        state.phase === "focus"
          ? state.completedFocus + 1
          : state.completedFocus;

      const nextState: PomodoroState = {
        ...state,
        phase: next,
        run: "stopped",
        remainingMs: nextRemaining,
        endAt: null,
        startAt: null,
        completedFocus,
      };

      return state.settings.autoStartNext
        ? startRunning({ ...nextState, startAt: action.now }, action.now)
        : nextState;
    }

    case "TICK": {
      if (state.run !== "running" || !state.endAt) return state;
      const remainingMs = computeRemaining(state.endAt, action.now);

      if (remainingMs > 0) return { ...state, remainingMs };

      // 到点：推进到下一阶段（相当于 SKIP）
      return pomodoroReducer(
        { ...state, remainingMs: 0 },
        { type: "SKIP", now: action.now },
      );
    }

    default:
      return state;
  }
}
