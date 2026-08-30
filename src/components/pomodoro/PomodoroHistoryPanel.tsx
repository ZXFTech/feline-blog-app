import { CircleAlert, CloudOff, CloudUpload } from 'lucide-react';
import NeuDiv from '@/components/NeuDiv';
import { formatDateHeading } from '@/lib/pomodoro/calendar';
import type { PomodoroHistoryRecord } from '@/types/pomodoro';
import PomodoroList from './PomodoroList';

interface PomodoroHistoryPanelProps {
  selectedDateKey: string;
  todayKey: string;
  timeZone: string;
  records: PomodoroHistoryRecord[];
  loading: boolean;
  error: string | null;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  pausedReason: string | null;
}

export default function PomodoroHistoryPanel({
  selectedDateKey,
  todayKey,
  timeZone,
  records,
  loading,
  error,
  pendingCount,
  failedCount,
  conflictCount,
  pausedReason,
}: PomodoroHistoryPanelProps) {
  const heading = formatDateHeading(selectedDateKey, todayKey);
  return (
    <section className="flex h-full min-h-0 flex-col gap-3" aria-labelledby="history-title">
      <div className="shrink-0 space-y-3" aria-live="polite" aria-atomic="true">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <NeuDiv className="px-3 py-1 text-base font-semibold">{heading.full}</NeuDiv>
            {heading.relative ? (
              <NeuDiv className="px-3 py-1 text-base font-semibold">{heading.relative}</NeuDiv>
            ) : null}
          </div>
          <p className="text-sm opacity-70">按 {timeZone} 的结束日期归档</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm" role="status">
          <span className="flex items-center gap-1 text-warning">
            <CloudUpload aria-hidden="true" size={17} />
            {pendingCount} 条待同步
          </span>
          <span className="flex items-center gap-1 text-danger">
            <CloudOff aria-hidden="true" size={17} />
            {failedCount} 条失败
          </span>
          <span className="flex items-center gap-1 text-slate-700">
            <CircleAlert aria-hidden="true" size={17} />
            {conflictCount} 条冲突
          </span>
        </div>
        {pausedReason ? <p className="text-sm text-danger">{pausedReason}</p> : null}
      </div>
      <div className="history-scroll min-h-0 flex-1 space-y-3 overflow-y-auto hide-scrollbar">
        {loading ? (
          <NeuDiv className="p-6" role="status">
            正在读取这一天的历史记录…
          </NeuDiv>
        ) : null}
        {error ? (
          <NeuDiv className="p-6 text-danger" role="alert">
            {error}
          </NeuDiv>
        ) : null}
        {!loading || records.length > 0 ? (
          <PomodoroList dataSource={records} timeZone={timeZone} />
        ) : null}
      </div>
    </section>
  );
}
