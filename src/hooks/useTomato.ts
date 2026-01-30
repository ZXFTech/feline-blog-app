"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  TomatoConfig,
  TomatoSession,
  TomatoState,
  SessionStatus,
  TimerPhase,
} from "@/types/tomato";

import { playStartSound, playEndSound } from "@/lib/audio/tomato";

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

interface UseTomatoOptions {
  config?: Partial<TomatoConfig>;
  onSessionComplete?: (session: TomatoSession) => void;
  beforeSessionComplete?: () => void;
  onSessionEndedEarly?: (session: TomatoSession) => void;
}

export function useTomato(options: UseTomatoOptions = {}) {
  const {
    config: configOverride = {},
    onSessionComplete,
    onSessionEndedEarly,
    beforeSessionComplete,
  } = options;

  // Merge config
  const config = { ...DEFAULT_CONFIG, ...configOverride };

  // State
  const [state, setState] = useState<TomatoState>({
    phase: "idle",
    type: "focus",
    focusMinutes: 0,
    totalSeconds: 0,
    remainingSeconds: 0,
    isRunning: false,
    sessionStartTime: 0,
    paused: false,
    isPaused: false,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<{
    startTime: number;
  } | null>(null);
  const lastUpdateRef = useRef<number>(0);

  /**
   * Update duration settings with validation
   */
  const setDuration = useCallback((focusMinutes: number) => {
    const validFocus = Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, focusMinutes));

    setState((prev) => ({
      ...prev,
      focusMinutes: validFocus,
      // If idle, update total seconds too
      ...(prev.phase === "idle" && {
        totalSeconds: validFocus * 60,
        remainingSeconds: validFocus * 60,
      }),
    }));
  }, []);

  /**
   * Start a focus or break session
   */
  const start = useCallback(
    (phase: "focus" | "break" = "focus", time: number) => {
      if (state.isRunning) return;

      const durationSeconds = time * 60;
      const now = Date.now();

      setState((prev) => ({
        ...prev,
        phase,
        type: phase,
        isRunning: true,
        paused: false,
        isPaused: false,
        focusMinutes: time,
        totalSeconds: durationSeconds,
        remainingSeconds: prev.remainingSeconds || durationSeconds,
        sessionStartTime: now,
      }));

      sessionRef.current = { startTime: now };
      lastUpdateRef.current = now;

      // Play start sound
      if (!config.muted) {
        playStartSound(config.volume);
      }
    },
    [config.muted, config.volume, state.isRunning],
  );

  /**
   * Pause the timer
   */
  const pause = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      paused: true,
      isPaused: true,
    }));
  }, []);

  /**
   * Resume the timer
   */
  const resume = useCallback(() => {
    if (!state.paused) return;

    const now = Date.now();
    lastUpdateRef.current = now;

    setState((prev) => ({
      ...prev,
      isRunning: true,
      paused: false,
      isPaused: false,
      sessionStartTime:
        now - (prev.totalSeconds - prev.remainingSeconds) * 1000,
    }));
  }, [state.paused]);

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "idle",
      isRunning: false,
      paused: false,
      isPaused: false,
      totalSeconds: 0,
      remainingSeconds: 0,
      sessionStartTime: 0,
    }));
    sessionRef.current = null;
  }, []);

  /**
   * End session early
   */
  const endEarly = useCallback(
    async (reason: string) => {
      if (!sessionRef.current) return;

      const now = Date.now();
      const session: TomatoSession = {
        type: state.type,
        id: crypto.randomUUID(),
        startTime: sessionRef.current.startTime,
        endTime: now,
        focusMinutes: state.focusMinutes,
        status: "ended_early" as SessionStatus,
        earlyStopReason: reason,
      };

      // Callback
      onSessionEndedEarly?.(session);

      reset();
    },
    [state.focusMinutes, onSessionEndedEarly, reset, state.type],
  );

  const beforeComplete = useCallback(() => {
    beforeSessionComplete?.();
  }, [beforeSessionComplete]);

  /**
   * Complete a session
   */
  const complete = useCallback(
    async (reflection: string = "") => {
      if (!sessionRef.current) return;

      const now = Date.now();
      const session: TomatoSession = {
        type: state.type,
        id: crypto.randomUUID(),
        startTime: sessionRef.current.startTime,
        endTime: now,
        focusMinutes: state.focusMinutes,
        status: "completed" as SessionStatus,
        reflection,
      };
      // Callback
      onSessionComplete?.(session);

      reset();
    },
    [state.type, state.focusMinutes, onSessionComplete, reset],
  );

  const more = useCallback(
    (phase: "focus" | "break", time: number) => {
      setState((prev) => ({
        ...prev,
        phase: phase,
        totalSeconds: prev.totalSeconds + time * 60,
        remainingSeconds: time * 60,
        isRunning: true,
        paused: false,
        isPaused: false,
        focusMinutes: prev.focusMinutes + time * 60,
      }));

      // Play start sound
      if (!config.muted) {
        playStartSound(config.volume);
      }
    },
    [config.muted, config.volume],
  );

  /**
   * Main timer tick using timestamp-based updates (avoids drift)
   */
  useEffect(() => {
    if (!state.isRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isRunning) return prev;

        const now = Date.now();
        const elapsedMs = now - (prev.sessionStartTime || now);
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const remaining = Math.max(0, prev.totalSeconds - elapsedSeconds);

        // Session complete
        if (remaining === 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          // Play end sound
          if (!config.muted) {
            playEndSound(config.volume);
          }
          beforeComplete();
          return {
            ...prev,
            isRunning: false,
            remainingSeconds: 0,
            phase: "idle",
          };
        }

        return {
          ...prev,
          remainingSeconds: remaining,
        };
      });
    }, 200); // 200ms interval for smooth updates, actual time calculated from timestamps

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.isRunning, config.muted, config.volume, beforeComplete]);

  // Format time helper
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, []);

  // Calculate progress percentage
  const progress =
    state.totalSeconds > 0
      ? ((state.totalSeconds - state.remainingSeconds) / state.totalSeconds) *
        100
      : 0;

  return {
    // State
    state,
    progress,
    formattedTime: formatTime(state.remainingSeconds),

    // Controls
    start,
    pause,
    resume,
    reset,
    endEarly,
    complete,
    setDuration,
    more,

    // Helpers
    formatTime,
    isPhaseActive: state.isRunning,
    isSessionActive: state.phase !== "idle",
  };
}
