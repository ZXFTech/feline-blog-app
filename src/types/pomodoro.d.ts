export type Phase = "idle" | "focus" | "short_break" | "long_break";
export type RunState = "stopped" | "running" | "paused";

export type TimerKind = Exclude<Phase, "idle">;

export interface PomodoroSettings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number; // 每 N 次专注后进入长休息
  autoStartNext: boolean; // 自动开始下一阶段
  mute: boolean; // 是否静音
  volume: number; // 音量大小 0 - 1 默认 0.5
}

export interface PomodoroState {
  phase: Phase;
  run: RunState;

  remainingMs: number; // 当前阶段剩余
  endAt: number | null; // running 时：预计结束时间戳（ms）

  completedFocus: number; // 已完成专注次数（用来决定长休息）
  settings: PomodoroSettings;
}

export type Action =
  | { type: "HYDRATE"; now: number; state: PomodoroState } // 恢复
  | { type: "SET_SETTINGS"; settings: Partial<PomodoroSettings> }
  | { type: "START"; now: number } // 开始当前 phase（idle 会转 focus）
  | { type: "PAUSE"; now: number }
  | { type: "RESUME"; now: number }
  | { type: "STOP" } // 回 idle
  | { type: "SKIP"; now: number } // 跳到下一阶段
  | { type: "TICK"; now: number }; // 驱动倒计时（仅 running 有效）
