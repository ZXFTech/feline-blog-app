"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import Calendar, { type RecordDate } from "@/components/Calendar";
import FlipTimer from "@/components/Clock/FlipTimer";
import NeuButton from "@/components/NeuButton";
import NeuDiv from "@/components/NeuDiv";
import NeuInput from "@/components/NeuInput";
import { getTomatoHistory } from "@/db/tomatoActions";
import { usePomodoro } from "@/hooks/usePomodoro";
import { localDateKey, monthUtcRange } from "@/lib/pomodoro/month";
import { toLocalHistory } from "@/lib/pomodoro/storage";
import { useCtxAuth } from "@/providers/AuthProviders";
import type { PomodoroHistoryRecord } from "@/types/pomodoro";
import { formatMs, phaseLabel } from "@/utils/timeUtils";
import PomodoroList from "./PomodoroList";

export function Pomodoro() {
  const { user } = useCtxAuth();
  const controller = usePomodoro();
  const { state, outbox, storageError, recoveryNotice } = controller;
  const [month, setMonth] = useState(() => new Date());
  const [history, setHistory] = useState<PomodoroHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    let active = true;
    const load = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const range = monthUtcRange(
          month.getFullYear(),
          month.getMonth(),
          timeZone,
        );
        const records = await getTomatoHistory(range);
        if (active) setHistory(records);
      } catch {
        if (active) setHistoryError("无法读取这个月的番茄记录，请稍后重试");
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [month, outbox.length, timeZone, user]);

  const mergedHistory = useMemo(() => {
    const map = new Map<string, PomodoroHistoryRecord>();
    history.forEach((record) => map.set(record.eventId ?? record.id, record));
    outbox.forEach((item) => {
      const local = toLocalHistory(item);
      const expectedMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
      if (localDateKey(local.endAt, timeZone).startsWith(expectedMonth))
        map.set(item.eventId, local);
    });
    return [...map.values()].sort(
      (a, b) =>
        b.startAt.localeCompare(a.startAt) ||
        (b.eventId ?? b.id).localeCompare(a.eventId ?? a.id),
    );
  }, [history, month, outbox, timeZone]);

  const recordDates: RecordDate[] = useMemo(
    () =>
      mergedHistory
        .filter(
          (record) =>
            record.type === "FOCUS" && record.endReason === "COMPLETED",
        )
        .map((record) => ({
          color: "bg-tomato-record",
          date: new Date(record.endAt),
          dateStr: localDateKey(record.endAt, timeZone),
        })),
    [mergedHistory, timeZone],
  );

  const blocked = Boolean(storageError || state.pendingOutcome || !user);
  const pendingCount = outbox.filter(
    (item) => item.status === "pending" || item.status === "syncing",
  ).length;
  const pausedCount = outbox.filter(
    (item) => item.status === "failed" || item.status === "conflict",
  ).length;

  return (
    <main className="space-y-6 pb-8" aria-labelledby="pomodoro-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm opacity-70">私人效率工作台</p>
          <h1 id="pomodoro-title" className="text-3xl font-bold">
            番茄钟
          </h1>
          <p className="mt-1 max-w-2xl opacity-75">
            专注一次，可靠记录一次。刷新、离线和多标签页不会重复写入结果。
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <span className="flex items-center gap-1">
            <Cloud aria-hidden="true" size={17} />
            {pendingCount} 条待同步
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck aria-hidden="true" size={17} />
            {pausedCount} 条需处理
          </span>
        </div>
      </header>

      {!user ? (
        <NeuDiv className="p-4" role="alert">
          请先登录，番茄钟会按账号隔离计时与历史。
        </NeuDiv>
      ) : null}
      {storageError ? (
        <NeuDiv
          className="flex items-center gap-2 p-4 text-danger"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" />
          {storageError}
        </NeuDiv>
      ) : null}
      {recoveryNotice ? (
        <NeuDiv className="p-4" role="status">
          {recoveryNotice}
        </NeuDiv>
      ) : null}

      <section
        className="grid gap-6 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(24rem,1.1fr)]"
        aria-label="计时与日历"
      >
        <NeuDiv className="space-y-5 p-5 sm:p-6">
          <div className="text-center">
            <p className="text-sm opacity-70">{phaseLabel(state)}</p>
            <div
              className="my-8"
              aria-label={`剩余时间 ${formatMs(state.remainingMs)}`}
            >
              <FlipTimer time={formatMs(state.remainingMs)} />
            </div>
            <p className="text-sm opacity-70">
              本轮已完成专注 {state.completedFocus} 次
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {state.run === "running" ? (
              <NeuButton onClick={controller.pause}>暂停</NeuButton>
            ) : state.run === "paused" ? (
              <NeuButton onClick={controller.resume}>继续</NeuButton>
            ) : (
              <NeuButton
                buttonType="primary"
                disabled={blocked}
                onClick={controller.start}
              >
                开始专注
              </NeuButton>
            )}
            <NeuButton
              disabled={!state.activeEventId}
              onClick={controller.skip}
            >
              跳过
            </NeuButton>
            <NeuButton
              buttonType="danger"
              disabled={!state.activeEventId}
              onClick={controller.stop}
            >
              停止
            </NeuButton>
            {pendingCount > 0 ? (
              <NeuButton onClick={() => void controller.retryNow()}>
                <RefreshCw aria-hidden="true" size={16} />
                立即同步
              </NeuButton>
            ) : null}
          </div>
          <fieldset
            className="grid grid-cols-2 gap-3 text-sm"
            disabled={state.run !== "stopped"}
          >
            <legend className="col-span-2 font-semibold">计时设置</legend>
            {(
              [
                ["focusMin", "专注分钟"],
                ["shortBreakMin", "短休分钟"],
                ["longBreakMin", "长休分钟"],
                ["longBreakEvery", "每几次长休"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span>{label}</span>
                <NeuInput
                  className="w-full"
                  min={1}
                  max={1440}
                  type="number"
                  value={state.settings[key]}
                  onChange={(event) =>
                    controller.setSettings({
                      [key]: Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
        </NeuDiv>
        <Calendar
          selectedDate={month}
          onMonthChange={setMonth}
          recordDate={recordDates}
        />
      </section>

      <section className="space-y-3" aria-labelledby="history-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="history-title" className="text-xl font-bold">
              本月历史
            </h2>
            <p className="text-sm opacity-70">按 {timeZone} 的结束日期归档</p>
          </div>
        </div>
        {historyLoading ? (
          <NeuDiv className="p-6" role="status">
            正在读取历史记录…
          </NeuDiv>
        ) : null}
        {historyError ? (
          <NeuDiv className="p-6 text-danger" role="alert">
            {historyError}
          </NeuDiv>
        ) : null}
        {!historyLoading && (!historyError || outbox.length > 0) ? (
          <PomodoroList
            dataSource={mergedHistory}
            onAdoptServer={controller.adoptServerRecord}
          />
        ) : null}
      </section>
    </main>
  );
}
