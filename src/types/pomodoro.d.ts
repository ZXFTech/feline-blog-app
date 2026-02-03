import {
  playBreakSound,
  playEndSound,
  playPauseSound,
  playResumeSound,
  playStartSound,
} from "@/lib/audio/tomato";
import { PomodoroRecord } from "../../generated/prisma/client";

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
  startAt: number | null; // 开始时间
  endAt: number | null; // running 时：预计结束时间戳（ms）

  completedFocus: number; // 已完成专注次数（用来决定长休息）
  settings: PomodoroSettings;
}

type PomodoroSound = "end" | "pause" | "resume" | "start" | "break";
const SOUND: Record<PomodoroSound, (v: number) => void> = {
  end: playEndSound,
  pause: playPauseSound,
  resume: playResumeSound,
  start: playStartSound,
  break: playBreakSound,
};

export type PomodoroSoundRule = {
  when: (prev: PomodoroState, curr: PomodoroState) => boolean;
  sound: PomodoroSound;
};

export type Action =
  | { type: "HYDRATE"; now: number; state: PomodoroState } // 恢复
  | { type: "SET_SETTINGS"; settings: Partial<PomodoroSettings> }
  | { type: "START"; now: number } // 开始当前 phase（idle 会转 focus）
  | { type: "PAUSE"; now: number }
  | { type: "RESUME"; now: number }
  | { type: "STOP" } // 回 idle
  | { type: "SKIP"; now: number } // 跳到下一阶段
  | { type: "TICK"; now: number }; // 驱动倒计时（仅 running 有效）

export type DispatchSource =
  | "user"
  | "tick"
  | "hydrate"
  | "remote"
  | "internal";

export type DispatchMeta = {
  source: DispatchSource;
  /** 用于跨 tab 同步：消息来源实例 id（避免回声） */
  origin?: string;
  /** 可选：标记本次更新原因，便于去重/调试 */
  reason?: string;
};

export type PomodoroActions = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skip: () => void;
  setSettings: (partial: Partial<PomodoroState["settings"]>) => void;
};

export type PluginContext<S> = {
  runtime: Map<string, unknown>;
  getState: () => S;
  // dispatch: (action: PomodoroAction, meta?: DispatchMeta) => void;
  // getLastDispatch: () => {
  //   action: PomodoroAction | null;
  //   meta: DispatchMeta | null;
  //   at: number;
  // };
  actions: PomodoroActions;
};

export type PomodoroPlugin<S> = {
  name: string;
  setup?: (ctx: PluginContext<S>) => void | (() => void);
  onStateChange?: (prev: S, next: S, ctx: PluginContext<S>) => void;
  wrapActions?: (
    actions: PomodoroActions,
    ctx: PluginContext<S>,
  ) => PomodoroActions;
};

export type PomodoroData = Omit<
  PomodoroRecord,
  "id" | "createAt" | "updateAt" | "userId" | "summary"
>;
