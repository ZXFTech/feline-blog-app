'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Content from '@/components/Content';
import NeuDiv from '@/components/NeuDiv';
import { getTomatoHistory } from '@/db/tomatoActions';
import { usePomodoro } from '@/hooks/usePomodoro';
import {
  cacheKey,
  CalendarMonth,
  dateKeyAt,
  mergeMonthHistory,
  monthFromDateKey,
  monthKey,
  nextLocalDayDelay,
  recordsForDate,
} from '@/lib/pomodoro/calendar';
import { localDateKey, monthUtcRange } from '@/lib/pomodoro/month';
import { useCtxAuth } from '@/providers/AuthProviders';
import type {
  PomodoroHistoryRecord,
  PomodoroOutboxItem,
  PomodoroSettlement,
} from '@/types/pomodoro';
import PomodoroHistoryPanel from './PomodoroHistoryPanel';
import PomodoroOperationPanel from './PomodoroOperationPanel';
import PomodoroTimer from './PomodoroTimer';

interface MonthEntry {
  records: PomodoroHistoryRecord[];
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  requestId: number;
}

function upsertRecord(records: PomodoroHistoryRecord[], record: PomodoroHistoryRecord) {
  const key = record.eventId ?? record.id;
  const next = new Map(records.map((item) => [item.eventId ?? item.id, item] as const));
  next.set(key, record);
  return [...next.values()];
}

function PomodoroWorkspace({ userId }: { userId: string }) {
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const initialTodayKey = useMemo(() => dateKeyAt(new Date(), timeZone), [timeZone]);
  const [todayKey, setTodayKey] = useState(initialTodayKey);
  const [selectedDateKey, setSelectedDateKey] = useState(initialTodayKey);
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() =>
    monthFromDateKey(initialTodayKey)
  );
  const [monthEntries, setMonthEntries] = useState<Record<string, MonthEntry>>({});
  const requestIdsRef = useRef(new Map<string, number>());
  const sessionGenerationRef = useRef(0);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const handleRecordSettled = useCallback(
    ({ item, record }: PomodoroSettlement) => {
      if (item.userId !== userIdRef.current) return;
      const recordMonth = monthFromDateKey(localDateKey(record.endAt, timeZone));
      const key = cacheKey(item.userId, timeZone, recordMonth);
      setMonthEntries((current) => {
        const entry = current[key] ?? {
          records: [],
          status: 'loaded' as const,
          error: null,
          requestId: 0,
        };
        return {
          ...current,
          [key]: {
            ...entry,
            records: upsertRecord(entry.records, record),
          },
        };
      });
    },
    [timeZone]
  );

  const controller = usePomodoro({ onRecordSettled: handleRecordSettled });

  const loadMonth = useCallback(
    async (month: CalendarMonth) => {
      const key = cacheKey(userId, timeZone, month);
      const requestId = (requestIdsRef.current.get(key) ?? 0) + 1;
      const generation = sessionGenerationRef.current;
      requestIdsRef.current.set(key, requestId);
      setMonthEntries((current) => ({
        ...current,
        [key]: {
          records: current[key]?.records ?? [],
          status: 'loading',
          error: null,
          requestId,
        },
      }));
      try {
        const result = await getTomatoHistory(
          monthUtcRange(month.year, month.monthIndex, timeZone)
        );
        if (result.status !== 'success') throw new Error(result.message);
        const records = result.data;
        if (
          userIdRef.current !== userId ||
          sessionGenerationRef.current !== generation ||
          requestIdsRef.current.get(key) !== requestId
        )
          return;
        setMonthEntries((current) => ({
          ...current,
          [key]: { records, status: 'loaded', error: null, requestId },
        }));
      } catch {
        if (
          userIdRef.current !== userId ||
          sessionGenerationRef.current !== generation ||
          requestIdsRef.current.get(key) !== requestId
        )
          return;
        setMonthEntries((current) => ({
          ...current,
          [key]: {
            records: current[key]?.records ?? [],
            status: 'error',
            error: '无法读取这个月的番茄记录，请稍后重试',
            requestId,
          },
        }));
      }
    },
    [timeZone, userId]
  );

  const selectedMonth = useMemo(() => monthFromDateKey(selectedDateKey), [selectedDateKey]);
  const visibleCacheKey = cacheKey(userId, timeZone, visibleMonth);
  const selectedCacheKey = cacheKey(userId, timeZone, selectedMonth);

  useEffect(() => {
    if (!monthEntries[visibleCacheKey]) void loadMonth(visibleMonth);
  }, [loadMonth, monthEntries, visibleCacheKey, visibleMonth]);

  useEffect(() => {
    if (!monthEntries[selectedCacheKey]) void loadMonth(selectedMonth);
  }, [loadMonth, monthEntries, selectedCacheKey, selectedMonth]);

  const previousOutboxRef = useRef<PomodoroOutboxItem[]>([]);
  useEffect(() => {
    const currentIds = new Set(controller.outbox.map((item) => item.eventId));
    const removed = previousOutboxRef.current.filter((item) => !currentIds.has(item.eventId));
    previousOutboxRef.current = controller.outbox;
    const affectedMonths = new Map<string, CalendarMonth>();
    removed.forEach((item) => {
      const month = monthFromDateKey(localDateKey(item.payload.endAt, timeZone));
      affectedMonths.set(monthKey(month), month);
    });
    affectedMonths.forEach((month) => void loadMonth(month));
  }, [controller.outbox, loadMonth, timeZone]);

  useEffect(() => {
    let timer = 0;
    const updateToday = () => {
      setTodayKey(dateKeyAt(new Date(), timeZone));
      window.clearTimeout(timer);
      timer = window.setTimeout(updateToday, nextLocalDayDelay(new Date(), timeZone));
    };
    const visible = () => {
      if (document.visibilityState === 'visible') updateToday();
    };
    updateToday();
    window.addEventListener('focus', updateToday);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', updateToday);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [timeZone]);

  const mergedVisibleHistory = useMemo(
    () =>
      mergeMonthHistory(
        monthEntries[visibleCacheKey]?.records ?? [],
        controller.outbox,
        visibleMonth,
        timeZone
      ),
    [controller.outbox, monthEntries, timeZone, visibleCacheKey, visibleMonth]
  );
  const mergedSelectedHistory = useMemo(
    () =>
      mergeMonthHistory(
        monthEntries[selectedCacheKey]?.records ?? [],
        controller.outbox,
        selectedMonth,
        timeZone
      ),
    [controller.outbox, monthEntries, selectedCacheKey, selectedMonth, timeZone]
  );
  const selectedHistory = useMemo(
    () => recordsForDate(mergedSelectedHistory, selectedDateKey, timeZone),
    [mergedSelectedHistory, selectedDateKey, timeZone]
  );
  const recordDates = useMemo(
    () =>
      mergedVisibleHistory
        .filter((record) => record.type === 'FOCUS' && record.endReason === 'COMPLETED')
        .map((record) => ({
          color: 'bg-tomato-record',
          dateKey: localDateKey(record.endAt, timeZone),
        })),
    [mergedVisibleHistory, timeZone]
  );

  const pendingCount = controller.outbox.filter((item) => item.status === 'pending').length;
  const syncingCount = controller.outbox.filter((item) => item.status === 'syncing').length;
  const failedItems = controller.outbox.filter((item) => item.status === 'failed');
  const conflicts = controller.outbox.filter((item) => item.status === 'conflict');
  const selectedEntry = monthEntries[selectedCacheKey];

  return (
    <Content
      className="flex justify-center"
      leftSideBar={
        <PomodoroHistoryPanel
          selectedDateKey={selectedDateKey}
          todayKey={todayKey}
          timeZone={timeZone}
          records={selectedHistory}
          loading={selectedEntry?.status === 'loading' && selectedHistory.length === 0}
          error={selectedEntry?.error ?? null}
          pendingCount={pendingCount + syncingCount}
          failedCount={failedItems.length}
          conflictCount={conflicts.length}
          pausedReason={failedItems.find((item) => item.lastError)?.lastError ?? null}
        />
      }
      rightSideBar={
        <PomodoroOperationPanel
          selectedDateKey={selectedDateKey}
          todayKey={todayKey}
          visibleMonth={visibleMonth}
          recordDates={recordDates}
          conflicts={conflicts}
          pendingCount={pendingCount}
          isOnline={controller.isOnline}
          isSyncing={controller.isSyncing}
          timeZone={timeZone}
          onDateSelect={setSelectedDateKey}
          onVisibleMonthChange={setVisibleMonth}
          onRetry={() => void controller.retryNow()}
          onAdoptServer={controller.adoptServerRecord}
        />
      }
    >
      <PomodoroTimer
        state={controller.state}
        storageError={controller.storageError}
        recoveryNotice={controller.recoveryNotice}
        onStart={controller.start}
        onPause={controller.pause}
        onResume={controller.resume}
        onSkip={controller.skip}
        onStop={controller.stop}
        onSettingsChange={controller.setSettings}
      />
    </Content>
  );
}

export function Pomodoro() {
  const { user } = useCtxAuth();
  if (!user)
    return (
      <Content className="flex items-center justify-center">
        <main className="w-full" aria-labelledby="pomodoro-login-title">
          <NeuDiv className="p-6 text-center" role="alert">
            <h1 id="pomodoro-login-title" className="text-xl font-bold">
              请先登录
            </h1>
            <p className="mt-2">番茄钟会按账号隔离计时与历史。</p>
          </NeuDiv>
        </main>
      </Content>
    );
  return <PomodoroWorkspace key={user.id} userId={user.id} />;
}
