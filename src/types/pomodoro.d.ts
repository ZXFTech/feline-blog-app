import {
  playBreakSound,
  playEndSound,
  playPauseSound,
  playResumeSound,
  playStartSound,
} from '@/lib/audio/tomato';
import { PomodoroEndReason, PomodoroType } from '../../generated/prisma/enums';

export type Phase = 'idle' | 'focus' | 'short_break' | 'long_break';
export type RunState = 'stopped' | 'running' | 'paused';

export type TimerKind = Exclude<Phase, 'idle'>;

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
  activeEventId: string | null;
  pendingOutcome: PomodoroOutcome | null;

  completedFocus: number; // 已完成专注次数（用来决定长休息）
  settings: PomodoroSettings;
}

type PomodoroSound = 'end' | 'pause' | 'resume' | 'start' | 'break';
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
  | { type: 'HYDRATE'; now: number; state: PomodoroState } // 恢复
  | { type: 'SET_SETTINGS'; settings: Partial<PomodoroSettings> }
  | { type: 'START'; now: number; eventId: string } // 开始当前 phase（idle 会转 focus）
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'STOP'; now: number } // 回 idle
  | { type: 'SKIP'; now: number } // 跳到下一阶段
  | { type: 'ACK_OUTCOME'; eventId: string }
  | { type: 'TICK'; now: number }; // 驱动倒计时（仅 running 有效）

export type DispatchSource = 'user' | 'tick' | 'hydrate' | 'remote' | 'internal';

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
  setSettings: (partial: Partial<PomodoroState['settings']>) => void;
};

export type PluginContext<S> = {
  runtime: Map<string, unknown>;
  getState: () => S;
  dispatch: (action: PomodoroAction, meta?: DispatchMeta) => void;
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
  wrapActions?: (actions: PomodoroActions, ctx: PluginContext<S>) => PomodoroActions;
};

export interface SavePomodoroInput {
  eventId: string;
  type: PomodoroType;
  endReason: PomodoroEndReason;
  startAt: string;
  endAt: string;
  targetDurationMs: number;
  remainingMs: number;
}

export type PomodoroOutcome = SavePomodoroInput;

export type PomodoroSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface PomodoroHistoryRecord {
  id: string;
  eventId: string | null;
  type: PomodoroType;
  endReason: PomodoroEndReason | null;
  finished: boolean;
  startAt: string;
  endAt: string;
  durationMs: number;
  actualDurationMs: number;
  syncStatus: PomodoroSyncStatus;
  lastError?: string | null;
}

export interface PomodoroSettlement {
  item: PomodoroOutboxItem;
  record: PomodoroHistoryRecord;
  status: 'created' | 'already_exists' | 'conflict';
}

export type SavePomodoroResult =
  | { status: 'created' | 'already_exists'; record: PomodoroHistoryRecord }
  | { status: 'conflict'; record: PomodoroHistoryRecord; message: string }
  | {
      status: 'unauthenticated' | 'invalid_payload' | 'temporary_failure';
      message: string;
    };

export interface PomodoroOutboxItem {
  schemaVersion: 2;
  userId: string;
  eventId: string;
  payload: SavePomodoroInput;
  createdAt: string;
  retryCount: number;
  nextAttemptAt: number;
  lastError: string | null;
  status: Exclude<PomodoroSyncStatus, 'synced'>;
  serverRecord?: PomodoroHistoryRecord;
}

export interface PomodoroTimerEnvelope {
  schemaVersion: 2;
  userId: string;
  state: PomodoroState;
}

export type PomodoroData = SavePomodoroInput;
