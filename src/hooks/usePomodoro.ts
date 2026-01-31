"use client";

import { useEffect, useMemo, useReducer, useRef, useCallback } from "react";
import { initialState } from "@/lib/pomodoro/reducer";
import { pomodoroReducer } from "@/lib/pomodoro/reducer";
import type { PomodoroSettings, PomodoroState } from "@/types/pomodoro";
import {
  playBreakSound,
  playEndSound,
  playPauseSound,
  playResumeSound,
  playStartSound,
} from "@/lib/audio/tomato";

const STORAGE_KEY = "pomodoro:v1";

function safeParse(json: string | null): PomodoroState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PomodoroState;
  } catch {
    return null;
  }
}

export function usePomodoro() {
  const [state, dispatch] = useReducer(pomodoroReducer, initialState);
  const intervalRef = useRef<number | null>(null);

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
  useEffect(() => {
    if (state.run !== "running") {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) return; // 防止重复启动

    intervalRef.current = window.setInterval(() => {
      dispatch({ type: "TICK", now: Date.now() });
    }, 250);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.run]);

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

  // 5) 示例扩展点：阶段切换通知（你也可以做成“插件”）
  const prevPhaseRef = useRef(state);
  useEffect(() => {
    if (
      prevPhaseRef.current.phase !== state.phase ||
      prevPhaseRef.current.run !== state.run
    ) {
      // phase 状态切换
      // idle => focus 中断后开始专注
      // focus => "long_break" || "short_break" 专注后开始休息
      // break => focus 休息结束后开始专注

      // run 状态切换
      // running => paused pause
      // paused => running resume
      // running => stopped stop/skip
      // stopped => running start/restart
      // TODO: 在这里发通知/播音效/记录日志等
      const prev = prevPhaseRef.current;
      const current = state;
      const volume = state.settings.volume || 0.5;

      if (current.run === "stopped") {
        // 停止
        playEndSound(volume);
      } else if (current.run === "paused") {
        // pause
        playPauseSound(volume);
      } else if (current.run === "running" && prev.run === "paused") {
        // resume
        playResumeSound(volume);
      } else if (current.run === "running" && prev.run === "stopped") {
        // start/restart
        if (current.phase === "focus") {
          // 专注
          playStartSound(volume || 0.5);
        } else if (
          current.phase === "long_break" ||
          current.phase === "short_break"
        ) {
          // 休息
          playBreakSound(volume || 0.5);
        }
      }

      // 日志记录

      prevPhaseRef.current = state;
    }
  }, [state]);

  return { state, ...api };
}
