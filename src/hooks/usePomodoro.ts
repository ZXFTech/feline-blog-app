"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { initialState } from "@/lib/pomodoro/reducer";
import { pomodoroReducer } from "@/lib/pomodoro/reducer";
import type {
  PluginContext,
  PomodoroPlugin,
  PomodoroSettings,
  PomodoroState,
} from "@/types/pomodoro";

import {
  AudioPlugin,
  RecordPlugin,
  tickPlugin,
  titlePlugin,
} from "@/lib/pomodoro/plugins";

const STORAGE_KEY = "pomodoro:v1";

function safeParse(json: string | null): PomodoroState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PomodoroState;
  } catch {
    return null;
  }
}

interface Props {
  plugins?: PomodoroPlugin<PomodoroState>[];
}

const defaultPlugins = [
  AudioPlugin(),
  RecordPlugin(),
  titlePlugin(),
  tickPlugin({}),
];

export function usePomodoro({ plugins }: Props = { plugins: defaultPlugins }) {
  const [state, dispatch] = useReducer(pomodoroReducer, initialState);

  // 1) 恢复
  useEffect(() => {
    const now = Date.now();
    const saved = safeParse(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
    );
    if (saved) dispatch({ type: "HYDRATE", now, state: saved });
  }, []);

  // 2) 持久化（基础版：每次变更写一次；需要可做节流）
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // 3) TICK 驱动（StrictMode 下用 ref + cleanup 保证单 interval）
  // useEffect(() => {
  //   if (state.run !== "running") {
  //     if (intervalRef.current) {
  //       window.clearInterval(intervalRef.current);
  //       intervalRef.current = null;
  //     }
  //     return;
  //   }

  //   if (intervalRef.current) return; // 防止重复启动

  //   intervalRef.current = window.setInterval(() => {
  //     dispatch({ type: "TICK", now: Date.now() });
  //   }, 250);

  //   return () => {
  //     if (intervalRef.current) {
  //       window.clearInterval(intervalRef.current);
  //       intervalRef.current = null;
  //     }
  //   };
  // }, [state.run]);

  // 4) 对外 API（可扩展：以后加 startFocus/startBreak/setTask...）
  const api = useMemo(() => {
    return {
      start: () => dispatch({ type: "START", now: Date.now() }),
      pause: () => dispatch({ type: "PAUSE", now: Date.now() }),
      resume: () => dispatch({ type: "RESUME", now: Date.now() }),
      stop: () => dispatch({ type: "STOP" }),
      skip: () => dispatch({ type: "SKIP", now: Date.now() }),
      setSettings: (partial: Partial<PomodoroSettings>) =>
        dispatch({ type: "SET_SETTINGS", settings: partial }),
    };
  }, []);

  const getState = useCallback(() => {
    return state;
  }, [state]);

  const ctx = useMemo<PluginContext<PomodoroState>>(
    () => ({
      runtime: new Map<string, unknown>(),
      actions: api,
      getState,
      dispatch,
    }),
    [api, getState],
  );

  // 初始化插件及插件清理
  useEffect(() => {
    const cleanUp = plugins?.map((p) => p.setup?.(ctx)).filter(Boolean);
    return () => {
      cleanUp?.map((item) => item?.());
    };
  }, [ctx, plugins]);

  // state 变动时, 将 state 分发给插件
  const prevStateRef = useRef(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    const next = state;
    if (prev === next) {
      return;
    }
    plugins?.forEach((p) => p.onStateChange?.(prev, next, ctx));
    prevStateRef.current = state;
  }, [ctx, plugins, state]);

  return { state, ...api };
}
