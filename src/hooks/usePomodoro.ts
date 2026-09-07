"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { savePomodoroRecord } from "@/db/tomatoActions";
import { initialState, pomodoroReducer } from "@/lib/pomodoro/reducer";
import {
  probePomodoroStorage,
  readOutbox,
  readTimer,
  removeOutbox,
  retryDelayMs,
  timerKey,
  writeOutbox,
  writeTimer,
} from "@/lib/pomodoro/storage";
import { AudioPlugin, tickPlugin } from "@/lib/pomodoro/plugins";
import { useCtxAuth } from "@/providers/AuthProviders";
import type {
  Action,
  DispatchMeta,
  PluginContext,
  PomodoroOutboxItem,
  PomodoroOutcome,
  PomodoroPlugin,
  PomodoroSettlement,
  PomodoroSettings,
  PomodoroState,
} from "@/types/pomodoro";

const defaultPlugins = [AudioPlugin(), tickPlugin({})];

export type PomodoroLifecycle = "signed_out" | "hydrating" | "ready";

interface Props {
  plugins?: PomodoroPlugin<PomodoroState>[];
  onRecordSettled?: (settlement: PomodoroSettlement) => void;
  onOutcome?: (outcome: PomodoroOutcome, source: DispatchMeta["source"]) => void;
}

export function usePomodoro({ plugins = defaultPlugins, onRecordSettled, onOutcome }: Props = {}) {
  const { user } = useCtxAuth();
  const userId = user?.id ?? null;
  const [state, dispatch] = useReducer(pomodoroReducer, initialState);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<PomodoroOutboxItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const syncingRef = useRef(false);
  const settlementRef = useRef(onRecordSettled);
  const outcomeRef = useRef(onOutcome);
  const skipInitialPersistRef = useRef(false);
  const stateRef = useRef(state);
  const userIdRef = useRef(userId);
  const sessionGenerationRef = useRef(0);
  const dispatchSourceRef = useRef<DispatchMeta["source"]>("internal");
  const runtimeRef = useRef(new Map<string, unknown>());
  stateRef.current = state;
  userIdRef.current = userId;
  settlementRef.current = onRecordSettled;
  outcomeRef.current = onOutcome;

  const lifecycle: PomodoroLifecycle = !userId
    ? "signed_out"
    : hydratedUserId === userId
      ? "ready"
      : "hydrating";
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;

  const trackedDispatch = useCallback((action: Action, meta?: DispatchMeta) => {
    dispatchSourceRef.current = meta?.source ?? "internal";
    dispatch(action);
  }, []);

  const reloadOutbox = useCallback(() => {
    if (!userId) {
      setOutbox([]);
      return [];
    }
    try {
      const items = readOutbox(userId);
      setOutbox(items);
      return items;
    } catch {
      setStorageError("浏览器存储不可用，暂时不能同步番茄记录");
      return [];
    }
  }, [userId]);

  const syncOutbox = useCallback(
    async (force = false) => {
      if (!userId || lifecycleRef.current !== "ready" || syncingRef.current || !navigator.onLine)
        return;
      const generation = sessionGenerationRef.current;
      const isCurrentSession = () =>
        userIdRef.current === userId && sessionGenerationRef.current === generation;
      syncingRef.current = true;
      if (isCurrentSession()) setIsSyncing(true);
      try {
        const items = reloadOutbox();
        for (const item of items) {
          if (!isCurrentSession()) break;
          if (["failed", "conflict"].includes(item.status)) continue;
          if (!force && item.nextAttemptAt > Date.now()) continue;
          const syncing = { ...item, status: "syncing" as const };
          if (!isCurrentSession()) break;
          writeOutbox(syncing);
          if (isCurrentSession()) setOutbox(readOutbox(userId));
          let result;
          try {
            if (!isCurrentSession()) break;
            result = await savePomodoroRecord(item.payload);
          } catch {
            result = {
              status: "temporary_failure" as const,
              message: "网络请求失败",
            };
          }

          if (!isCurrentSession()) break;

          if (result.status === "created" || result.status === "already_exists") {
            settlementRef.current?.({
              item,
              record: result.record,
              status: result.status,
            });
            removeOutbox(userId, item.eventId);
          } else if (result.status === "conflict") {
            settlementRef.current?.({
              item,
              record: result.record,
              status: result.status,
            });
            writeOutbox({
              ...item,
              status: "conflict",
              lastError: result.message,
              serverRecord: result.record,
            });
          } else if (result.status === "unauthenticated") {
            writeOutbox({
              ...item,
              status: "failed",
              lastError: result.message,
            });
          } else if (
            result.status === "invalid_input" ||
            result.status === "forbidden" ||
            result.status === "not_found"
          ) {
            writeOutbox({
              ...item,
              status: "failed",
              lastError: result.message,
            });
          } else if (result.status === "temporary_failure") {
            const retryCount = item.retryCount + 1;
            writeOutbox({
              ...item,
              status: "pending",
              retryCount,
              nextAttemptAt: Date.now() + retryDelayMs(retryCount),
              lastError: result.message,
            });
          }
        }
      } catch {
        setStorageError("本地同步队列暂时无法读取");
      } finally {
        syncingRef.current = false;
        if (isCurrentSession()) {
          setIsSyncing(false);
          reloadOutbox();
        }
      }
    },
    [reloadOutbox, userId]
  );

  useEffect(() => {
    sessionGenerationRef.current += 1;
    setHydratedUserId(null);
    skipInitialPersistRef.current = true;
    trackedDispatch(
      { type: "HYDRATE", now: Date.now(), state: initialState },
      { source: "hydrate" }
    );
    if (!userId) {
      setOutbox([]);
      setStorageError(null);
      setRecoveryNotice(null);
      return;
    }
    try {
      probePomodoroStorage();
      setStorageError(null);
      const restored = readTimer(userId);
      if (restored.recovered) setRecoveryNotice("无法恢复的计时数据已隔离，你可以重新开始");
      if (restored.state)
        trackedDispatch(
          { type: "HYDRATE", now: Date.now(), state: restored.state },
          { source: "hydrate" }
        );
      reloadOutbox();
    } catch {
      setStorageError("浏览器存储不可用，无法安全开始新的计时");
    } finally {
      if (userIdRef.current === userId) setHydratedUserId(userId);
    }
  }, [reloadOutbox, trackedDispatch, userId]);

  useEffect(() => {
    if (!userId) return;
    if (skipInitialPersistRef.current) {
      skipInitialPersistRef.current = false;
      return;
    }
    try {
      if (state.pendingOutcome) {
        if (dispatchSourceRef.current !== "remote")
          outcomeRef.current?.(state.pendingOutcome, dispatchSourceRef.current);
        const existing = readOutbox(userId).find(
          (item) => item.eventId === state.pendingOutcome?.eventId
        );
        if (!existing) {
          writeOutbox({
            schemaVersion: 2,
            userId,
            eventId: state.pendingOutcome.eventId,
            payload: state.pendingOutcome,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            nextAttemptAt: 0,
            lastError: null,
            status: "pending",
          });
        }
        writeTimer(userId, { ...state, pendingOutcome: null });
        trackedDispatch(
          {
            type: "ACK_OUTCOME",
            eventId: state.pendingOutcome.eventId,
          },
          { source: "internal" }
        );
        reloadOutbox();
        void syncOutbox(true);
        return;
      }
      if (dispatchSourceRef.current === "tick" || dispatchSourceRef.current === "remote") return;
      writeTimer(userId, state);
      setStorageError(null);
    } catch {
      setStorageError("计时结果尚未安全保存，已阻止下一阶段，请保持页面开启以便恢复");
    }
  }, [reloadOutbox, state, syncOutbox, trackedDispatch, userId]);

  const api = useMemo(
    () => ({
      start: () => {
        if (
          !userId ||
          lifecycleRef.current !== "ready" ||
          storageError ||
          stateRef.current.pendingOutcome
        )
          return;
        try {
          probePomodoroStorage();
          const action = {
            type: "START" as const,
            now: Date.now(),
            eventId: crypto.randomUUID(),
          };
          const nextState = pomodoroReducer(stateRef.current, action);
          writeTimer(userId, nextState);
          trackedDispatch(action, { source: "user" });
        } catch {
          setStorageError("浏览器存储不可用，无法安全开始新的计时");
        }
      },
      pause: () => {
        if (lifecycleRef.current === "ready")
          trackedDispatch({ type: "PAUSE", now: Date.now() }, { source: "user" });
      },
      resume: () => {
        if (lifecycleRef.current === "ready")
          trackedDispatch({ type: "RESUME", now: Date.now() }, { source: "user" });
      },
      stop: () => {
        if (lifecycleRef.current === "ready")
          trackedDispatch({ type: "STOP", now: Date.now() }, { source: "user" });
      },
      skip: () => {
        if (lifecycleRef.current === "ready")
          trackedDispatch({ type: "SKIP", now: Date.now() }, { source: "user" });
      },
      setSettings: (partial: Partial<PomodoroSettings>) => {
        if (lifecycleRef.current === "ready")
          trackedDispatch({ type: "SET_SETTINGS", settings: partial }, { source: "user" });
      },
    }),
    [storageError, trackedDispatch, userId]
  );

  const ctxRef = useRef<PluginContext<PomodoroState> | null>(null);
  if (!ctxRef.current) {
    ctxRef.current = {
      runtime: runtimeRef.current,
      actions: api,
      getState: () => stateRef.current,
      dispatch: trackedDispatch,
    };
  }
  ctxRef.current.actions = api;

  useEffect(() => {
    const ctx = ctxRef.current!;
    const cleanups = plugins.map((plugin) => plugin.setup?.(ctx)).filter(Boolean);
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [plugins]);

  const previousRef = useRef(state);
  useEffect(() => {
    const previous = previousRef.current;
    if (previous !== state)
      plugins.forEach((plugin) => plugin.onStateChange?.(previous, state, ctxRef.current!));
    previousRef.current = state;
  }, [plugins, state]);

  useEffect(() => {
    if (!userId) return;
    const trigger = () => void syncOutbox(true);
    const online = () => {
      setIsOnline(true);
      trigger();
    };
    const offline = () => setIsOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") trigger();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === timerKey(userId) && event.newValue) {
        const restored = readTimer(userId);
        if (restored.state)
          trackedDispatch(
            { type: "HYDRATE", now: Date.now(), state: restored.state },
            { source: "remote" }
          );
      }
      if (event.key?.startsWith(`pomodoro:v2:outbox:${userId}:`)) reloadOutbox();
    };
    setIsOnline(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    const interval = window.setInterval(() => void syncOutbox(), 1000);
    void syncOutbox(true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [lifecycle, reloadOutbox, syncOutbox, trackedDispatch, userId]);

  const adoptServerRecord = useCallback(
    (eventId: string) => {
      if (!userId || lifecycleRef.current !== "ready") return;
      removeOutbox(userId, eventId);
      reloadOutbox();
    },
    [reloadOutbox, userId]
  );

  const retryNow = useCallback(() => syncOutbox(true), [syncOutbox]);

  return {
    lifecycle,
    state,
    ...api,
    outbox,
    storageError,
    recoveryNotice,
    isOnline,
    isSyncing,
    retryNow,
    adoptServerRecord,
  };
}
