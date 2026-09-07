"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { PomodoroEndReason } from "../../generated/prisma/enums";
import { toast } from "@/components/ProMessage";
import { usePomodoro, type PomodoroLifecycle } from "@/hooks/usePomodoro";
import { useCtxAuth } from "@/providers/AuthProviders";
import type {
  DispatchMeta,
  PomodoroActions,
  PomodoroOutboxItem,
  PomodoroOutcome,
  PomodoroSettlement,
  PomodoroState,
} from "@/types/pomodoro";

export interface PomodoroStateContextValue {
  lifecycle: PomodoroLifecycle;
  state: PomodoroState;
  outbox: PomodoroOutboxItem[];
  storageError: string | null;
  recoveryNotice: string | null;
  isOnline: boolean;
  isSyncing: boolean;
}

export interface PomodoroActionsContextValue extends PomodoroActions {
  retryNow: () => Promise<void>;
  adoptServerRecord: (eventId: string) => void;
}

type SettlementListener = (settlement: PomodoroSettlement) => void;
type SubscribeSettlement = (listener: SettlementListener) => () => void;

const PomodoroStateContext = createContext<PomodoroStateContextValue | null>(null);
const PomodoroActionsContext = createContext<PomodoroActionsContextValue | null>(null);
const PomodoroSettlementContext = createContext<SubscribeSettlement | null>(null);

PomodoroStateContext.displayName = "PomodoroStateContext";
PomodoroActionsContext.displayName = "PomodoroActionsContext";
PomodoroSettlementContext.displayName = "PomodoroSettlementContext";

interface PomodoroProviderProps {
  children: ReactNode;
}

export function PomodoroProvider({ children }: PomodoroProviderProps) {
  const { user } = useCtxAuth();
  const listenersRef = useRef(new Set<SettlementListener>());
  const notifiedOutcomesRef = useRef(new Set<string>());

  const publishSettlement = useCallback((settlement: PomodoroSettlement) => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(settlement);
      } catch {
        // A page projection must never interrupt durable outbox settlement.
      }
    });
  }, []);

  const notifyOutcome = useCallback(
    (outcome: PomodoroOutcome, source: DispatchMeta["source"]) => {
      if (
        !user ||
        outcome.endReason !== PomodoroEndReason.COMPLETED ||
        (source !== "tick" && source !== "hydrate")
      )
        return;
      const key = `${user.id}:${outcome.eventId}`;
      if (notifiedOutcomesRef.current.has(key)) return;
      notifiedOutcomesRef.current.add(key);
      try {
        toast.success("本阶段已完成，记录将自动保存", { id: `pomodoro:${key}` });
      } catch {
        // Feedback failure must not interrupt timer persistence or synchronization.
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) notifiedOutcomesRef.current.clear();
  }, [user]);

  const controller = usePomodoro({
    onRecordSettled: publishSettlement,
    onOutcome: notifyOutcome,
  });

  const subscribeSettlement = useCallback<SubscribeSettlement>((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const stateValue = useMemo<PomodoroStateContextValue>(
    () => ({
      lifecycle: controller.lifecycle,
      state: controller.state,
      outbox: controller.outbox,
      storageError: controller.storageError,
      recoveryNotice: controller.recoveryNotice,
      isOnline: controller.isOnline,
      isSyncing: controller.isSyncing,
    }),
    [
      controller.isOnline,
      controller.isSyncing,
      controller.lifecycle,
      controller.outbox,
      controller.recoveryNotice,
      controller.state,
      controller.storageError,
    ]
  );

  const actionsValue = useMemo<PomodoroActionsContextValue>(
    () => ({
      start: controller.start,
      pause: controller.pause,
      resume: controller.resume,
      stop: controller.stop,
      skip: controller.skip,
      setSettings: controller.setSettings,
      retryNow: controller.retryNow,
      adoptServerRecord: controller.adoptServerRecord,
    }),
    [
      controller.adoptServerRecord,
      controller.pause,
      controller.resume,
      controller.retryNow,
      controller.setSettings,
      controller.skip,
      controller.start,
      controller.stop,
    ]
  );

  return (
    <PomodoroSettlementContext.Provider value={subscribeSettlement}>
      <PomodoroActionsContext.Provider value={actionsValue}>
        <PomodoroStateContext.Provider value={stateValue}>{children}</PomodoroStateContext.Provider>
      </PomodoroActionsContext.Provider>
    </PomodoroSettlementContext.Provider>
  );
}

export function usePomodoroState(): PomodoroStateContextValue {
  const context = useContext(PomodoroStateContext);
  if (context === null) throw new Error("usePomodoroState must be used within PomodoroProvider");
  return context;
}

export function usePomodoroActions(): PomodoroActionsContextValue {
  const context = useContext(PomodoroActionsContext);
  if (context === null) throw new Error("usePomodoroActions must be used within PomodoroProvider");
  return context;
}

export function usePomodoroSettlement(listener: SettlementListener): void {
  const subscribe = useContext(PomodoroSettlementContext);
  if (subscribe === null)
    throw new Error("usePomodoroSettlement must be used within PomodoroProvider");
  const listenerRef = useRef(listener);

  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  useEffect(() => subscribe((settlement) => listenerRef.current(settlement)), [subscribe]);
}
