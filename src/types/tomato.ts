/**
 * Tomato Timer Types and Interfaces
 */

export type TomatoTheme = "neumorphism" | "glass" | "dark";

export type SessionStatus = "completed" | "ended_early";

export type TimerPhase = "focus" | "break" | "idle";

export type TimeType = "focus" | "break";

export interface TomatoSession {
  id: string;
  type: TimeType;
  startTime: number; // timestamp in ms
  endTime: number; // timestamp in ms
  focusMinutes: number;
  status: SessionStatus;
  reflection?: string; // for completed sessions
  earlyStopReason?: string; // for ended_early sessions
}

export interface TomatoState {
  phase: TimerPhase; // 'focus', 'break', or 'idle'
  type: TimeType;
  focusMinutes: number;
  totalSeconds: number; // total seconds for current phase
  remainingSeconds: number; // remaining seconds
  isRunning: boolean;
  sessionStartTime: number; // when the session began
  paused: boolean;
  isPaused: boolean;
}

export interface TomatoConfig {
  focusMinutes: number;
  theme?: TomatoTheme;
  muted?: boolean;
  volume?: number; // 0-1
}

export const DEFAULT_CONFIG: TomatoConfig = {
  focusMinutes: 25,
  theme: "neumorphism",
  muted: false,
  volume: 0.7,
};

// Validation constants
export const FOCUS_MIN = 1;
export const FOCUS_MAX = 120;
export const BREAK_MIN = 1;
export const BREAK_MAX = 60;
