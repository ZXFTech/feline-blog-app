'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { savePomodoroRecord } from '@/db/tomatoActions';
import { initialState, pomodoroReducer } from '@/lib/pomodoro/reducer';
import {
  probePomodoroStorage,
  readOutbox,
  readTimer,
  removeOutbox,
  retryDelayMs,
  timerKey,
  writeOutbox,
  writeTimer,
} from '@/lib/pomodoro/storage';
import { AudioPlugin, tickPlugin, titlePlugin } from '@/lib/pomodoro/plugins';
import { useCtxAuth } from '@/providers/AuthProviders';
import type {
  PluginContext,
  PomodoroOutboxItem,
  PomodoroPlugin,
  PomodoroSettlement,
  PomodoroSettings,
  PomodoroState,
} from '@/types/pomodoro';

const defaultPlugins = [AudioPlugin(), titlePlugin(), tickPlugin({})];

interface Props {
  plugins?: PomodoroPlugin<PomodoroState>[];
  onRecordSettled?: (settlement: PomodoroSettlement) => void;
}

export function usePomodoro({ plugins = defaultPlugins, onRecordSettled }: Props = {}) {
  const { user } = useCtxAuth();
  const userId = user?.id ?? null;
  const [state, dispatch] = useReducer(pomodoroReducer, initialState);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<PomodoroOutboxItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const syncingRef = useRef(false);
  const settlementRef = useRef(onRecordSettled);
  const skipInitialPersistRef = useRef(false);
  const stateRef = useRef(state);
  const runtimeRef = useRef(new Map<string, unknown>());
  stateRef.current = state;
  settlementRef.current = onRecordSettled;

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
      setStorageError('浏览器存储不可用，暂时不能同步番茄记录');
      return [];
    }
  }, [userId]);

  const syncOutbox = useCallback(
    async (force = false) => {
      if (!userId || syncingRef.current || !navigator.onLine) return;
      syncingRef.current = true;
      setIsSyncing(true);
      try {
        const items = reloadOutbox();
        for (const item of items) {
          if (['failed', 'conflict'].includes(item.status)) continue;
          if (!force && item.nextAttemptAt > Date.now()) continue;
          const syncing = { ...item, status: 'syncing' as const };
          writeOutbox(syncing);
          setOutbox(readOutbox(userId));
          let result;
          try {
            result = await savePomodoroRecord(item.payload);
          } catch {
            result = {
              status: 'temporary_failure' as const,
              message: '网络请求失败',
            };
          }

          if (result.status === 'created' || result.status === 'already_exists') {
            settlementRef.current?.({
              item,
              record: result.record,
              status: result.status,
            });
            removeOutbox(userId, item.eventId);
          } else if (result.status === 'conflict') {
            settlementRef.current?.({
              item,
              record: result.record,
              status: result.status,
            });
            writeOutbox({
              ...item,
              status: 'conflict',
              lastError: result.message,
              serverRecord: result.record,
            });
          } else if (result.status === 'unauthenticated') {
            writeOutbox({
              ...item,
              status: 'failed',
              lastError: result.message,
            });
          } else if (
            result.status === 'invalid_input' ||
            result.status === 'forbidden' ||
            result.status === 'not_found'
          ) {
            writeOutbox({
              ...item,
              status: 'failed',
              lastError: result.message,
            });
          } else if (result.status === 'temporary_failure') {
            const retryCount = item.retryCount + 1;
            writeOutbox({
              ...item,
              status: 'pending',
              retryCount,
              nextAttemptAt: Date.now() + retryDelayMs(retryCount),
              lastError: result.message,
            });
          }
        }
      } catch {
        setStorageError('本地同步队列暂时无法读取');
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
        reloadOutbox();
      }
    },
    [reloadOutbox, userId]
  );

  useEffect(() => {
    skipInitialPersistRef.current = true;
    dispatch({ type: 'HYDRATE', now: Date.now(), state: initialState });
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
      if (restored.recovered) setRecoveryNotice('无法恢复的计时数据已隔离，你可以重新开始');
      if (restored.state) dispatch({ type: 'HYDRATE', now: Date.now(), state: restored.state });
      reloadOutbox();
    } catch {
      setStorageError('浏览器存储不可用，无法安全开始新的计时');
    }
  }, [reloadOutbox, userId]);

  useEffect(() => {
    if (!userId) return;
    if (skipInitialPersistRef.current) {
      skipInitialPersistRef.current = false;
      return;
    }
    try {
      if (state.pendingOutcome) {
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
            status: 'pending',
          });
        }
        writeTimer(userId, { ...state, pendingOutcome: null });
        dispatch({
          type: 'ACK_OUTCOME',
          eventId: state.pendingOutcome.eventId,
        });
        reloadOutbox();
        void syncOutbox(true);
        return;
      }
      writeTimer(userId, state);
      setStorageError(null);
    } catch {
      setStorageError('计时结果尚未安全保存，已阻止下一阶段，请保持页面开启以便恢复');
    }
  }, [reloadOutbox, state, syncOutbox, userId]);

  const api = useMemo(
    () => ({
      start: () => {
        if (!userId || storageError || stateRef.current.pendingOutcome) return;
        try {
          probePomodoroStorage();
          const action = {
            type: 'START' as const,
            now: Date.now(),
            eventId: crypto.randomUUID(),
          };
          const nextState = pomodoroReducer(stateRef.current, action);
          writeTimer(userId, nextState);
          dispatch(action);
        } catch {
          setStorageError('浏览器存储不可用，无法安全开始新的计时');
        }
      },
      pause: () => dispatch({ type: 'PAUSE', now: Date.now() }),
      resume: () => dispatch({ type: 'RESUME', now: Date.now() }),
      stop: () => dispatch({ type: 'STOP', now: Date.now() }),
      skip: () => dispatch({ type: 'SKIP', now: Date.now() }),
      setSettings: (partial: Partial<PomodoroSettings>) =>
        dispatch({ type: 'SET_SETTINGS', settings: partial }),
    }),
    [storageError, userId]
  );

  const ctxRef = useRef<PluginContext<PomodoroState> | null>(null);
  if (!ctxRef.current) {
    ctxRef.current = {
      runtime: runtimeRef.current,
      actions: api,
      getState: () => stateRef.current,
      dispatch,
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
      if (document.visibilityState === 'visible') trigger();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === timerKey(userId) && event.newValue) {
        const restored = readTimer(userId);
        if (restored.state) dispatch({ type: 'HYDRATE', now: Date.now(), state: restored.state });
      }
      if (event.key?.startsWith(`pomodoro:v2:outbox:${userId}:`)) reloadOutbox();
    };
    setIsOnline(navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(() => void syncOutbox(), 1000);
    void syncOutbox(true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reloadOutbox, syncOutbox, userId]);

  const adoptServerRecord = useCallback(
    (eventId: string) => {
      if (!userId) return;
      removeOutbox(userId, eventId);
      reloadOutbox();
    },
    [reloadOutbox, userId]
  );

  return {
    state,
    ...api,
    outbox,
    storageError,
    recoveryNotice,
    isOnline,
    isSyncing,
    retryNow: () => syncOutbox(true),
    adoptServerRecord,
  };
}
