import {
  PomodoroEndReason,
  PomodoroType,
} from "../../../generated/prisma/enums";
import type {
  Action,
  PomodoroOutcome,
  PomodoroSettings,
  PomodoroState,
  TimerKind,
} from "@/types/pomodoro";

const ms = (min: number) => Math.max(0, Math.round(min * 60_000));

export const defaultSettings: PomodoroSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 10,
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
  activeEventId: null,
  pendingOutcome: null,
  completedFocus: 0,
  settings: defaultSettings,
};

export function durationMsFor(phase: TimerKind, settings: PomodoroSettings) {
  if (phase === "focus") return ms(settings.focusMin);
  if (phase === "short_break") return ms(settings.shortBreakMin);
  return ms(settings.longBreakMin);
}

function prismaType(phase: TimerKind) {
  if (phase === "focus") return PomodoroType.FOCUS;
  if (phase === "short_break") return PomodoroType.SHORT;
  return PomodoroType.LONG;
}

function nextPhase(state: PomodoroState): TimerKind {
  if (state.phase === "idle") return "focus";
  if (state.phase !== "focus") return "focus";
  const completed = state.completedFocus + 1;
  return state.settings.longBreakEvery > 0 &&
    completed % state.settings.longBreakEvery === 0
    ? "long_break"
    : "short_break";
}

function remainingAt(state: PomodoroState, now: number) {
  if (state.run === "running" && state.endAt)
    return Math.max(0, state.endAt - now);
  return state.remainingMs;
}

function makeOutcome(
  state: PomodoroState,
  reason: PomodoroEndReason,
  now: number,
): PomodoroOutcome | null {
  if (state.phase === "idle" || !state.activeEventId || !state.startAt)
    return null;
  const targetDurationMs = durationMsFor(state.phase, state.settings);
  const completed =
    reason === PomodoroEndReason.COMPLETED ||
    (state.endAt !== null && now >= state.endAt);
  const endReason = completed ? PomodoroEndReason.COMPLETED : reason;
  const remainingMs = completed ? 0 : remainingAt(state, now);
  const endAt = completed && state.endAt ? state.endAt : now;
  return {
    eventId: state.activeEventId,
    type: prismaType(state.phase),
    endReason,
    startAt: new Date(state.startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    targetDurationMs,
    remainingMs,
  };
}

function settle(
  state: PomodoroState,
  reason: PomodoroEndReason,
  now: number,
): PomodoroState {
  const outcome = makeOutcome(state, reason, now);
  if (!outcome) return state;
  if (outcome.endReason === PomodoroEndReason.STOPPED) {
    return {
      ...state,
      phase: "idle",
      run: "stopped",
      remainingMs: durationMsFor("focus", state.settings),
      startAt: null,
      endAt: null,
      activeEventId: null,
      pendingOutcome: outcome,
    };
  }
  const next = nextPhase(state);
  return {
    ...state,
    phase: next,
    run: "stopped",
    remainingMs: durationMsFor(next, state.settings),
    startAt: null,
    endAt: null,
    activeEventId: null,
    pendingOutcome: outcome,
    completedFocus:
      state.phase === "focus" ? state.completedFocus + 1 : state.completedFocus,
  };
}

export function pomodoroReducer(
  state: PomodoroState,
  action: Action,
): PomodoroState {
  switch (action.type) {
    case "HYDRATE": {
      const hydrated = action.state;
      if (
        hydrated.run === "running" &&
        hydrated.endAt &&
        action.now >= hydrated.endAt
      ) {
        return settle(
          { ...hydrated, remainingMs: 0 },
          PomodoroEndReason.COMPLETED,
          hydrated.endAt,
        );
      }
      if (hydrated.run === "running" && hydrated.endAt) {
        return { ...hydrated, remainingMs: remainingAt(hydrated, action.now) };
      }
      return hydrated;
    }
    case "SET_SETTINGS": {
      const settings = { ...state.settings, ...action.settings };
      if (state.run === "stopped") {
        const phase = state.phase === "idle" ? "focus" : state.phase;
        return {
          ...state,
          settings,
          remainingMs: durationMsFor(phase, settings),
        };
      }
      return { ...state, settings };
    }
    case "START": {
      if (state.pendingOutcome || state.run === "running") return state;
      const phase = state.phase === "idle" ? "focus" : state.phase;
      const remainingMs =
        state.run === "paused"
          ? state.remainingMs
          : durationMsFor(phase, state.settings);
      return {
        ...state,
        phase,
        run: "running",
        remainingMs,
        startAt: state.run === "paused" ? state.startAt : action.now,
        endAt: action.now + remainingMs,
        activeEventId:
          state.run === "paused" ? state.activeEventId : action.eventId,
      };
    }
    case "PAUSE":
      if (state.run !== "running" || !state.endAt) return state;
      return {
        ...state,
        run: "paused",
        remainingMs: remainingAt(state, action.now),
        endAt: null,
      };
    case "RESUME":
      if (state.run !== "paused") return state;
      return {
        ...state,
        run: "running",
        endAt: action.now + state.remainingMs,
      };
    case "STOP":
      return settle(state, PomodoroEndReason.STOPPED, action.now);
    case "SKIP":
      return settle(state, PomodoroEndReason.SKIPPED, action.now);
    case "TICK":
      if (state.run !== "running" || !state.endAt) return state;
      if (action.now < state.endAt)
        return { ...state, remainingMs: remainingAt(state, action.now) };
      return settle(
        { ...state, remainingMs: 0 },
        PomodoroEndReason.COMPLETED,
        state.endAt,
      );
    case "ACK_OUTCOME":
      return state.pendingOutcome?.eventId === action.eventId
        ? { ...state, pendingOutcome: null }
        : state;
    default:
      return state;
  }
}
