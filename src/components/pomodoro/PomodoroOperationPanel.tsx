import { RefreshCw } from "lucide-react";
import PomodoroCalendar, { type RecordDate } from "@/components/PomodoroCalendar";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";
import type { CalendarMonth } from "@/lib/pomodoro/calendar";
import type { PomodoroOutboxItem } from "@/types/pomodoro";

interface PomodoroOperationPanelProps {
  selectedDateKey: string;
  todayKey: string;
  visibleMonth: CalendarMonth;
  recordDates: RecordDate[];
  conflicts: PomodoroOutboxItem[];
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  timeZone: string;
  onDateSelect: (dateKey: string) => void;
  onVisibleMonthChange: (month: CalendarMonth) => void;
  onRetry: () => void;
  onAdoptServer: (eventId: string) => void;
}

export default function PomodoroOperationPanel({
  selectedDateKey,
  todayKey,
  visibleMonth,
  recordDates,
  conflicts,
  pendingCount,
  isOnline,
  isSyncing,
  timeZone,
  onDateSelect,
  onVisibleMonthChange,
  onRetry,
  onAdoptServer,
}: PomodoroOperationPanelProps) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const retryDisabled = pendingCount === 0 || !isOnline || isSyncing;
  const retryReason =
    pendingCount === 0
      ? "没有待同步记录"
      : !isOnline
        ? "离线时不能同步"
        : isSyncing
          ? "正在同步"
          : null;

  return (
    <div className="min-w-0 space-y-4">
      <div className="overflow-x-auto hide-scrollbar">
        <PomodoroCalendar
          selectedDateKey={selectedDateKey}
          todayKey={todayKey}
          visibleMonth={visibleMonth}
          onDateSelect={onDateSelect}
          onVisibleMonthChange={onVisibleMonthChange}
          recordDate={recordDates}
        />
      </div>
      <NeuSurface className="space-y-3 p-4" aria-label="番茄钟操作面板">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={retryDisabled} onClick={onRetry}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <RefreshCw aria-hidden="true" className="shrink-0" size={16} />
              <span>立即同步</span>
            </span>
          </Button>
          {retryReason ? <span className="text-sm opacity-70">{retryReason}</span> : null}
        </div>
        {conflicts.length > 0 ? (
          <section aria-labelledby="conflict-title" className="space-y-2">
            <h2 id="conflict-title" className="font-semibold">
              待处理记录
            </h2>
            <ul className="space-y-2">
              {conflicts.map((item) => (
                <li key={item.eventId}>
                  <NeuSurface elevation="flat" className="space-y-3 p-3 text-sm">
                    <p className="break-words">
                      本地 {formatter.format(new Date(item.payload.endAt))}，{item.payload.type}
                      {item.serverRecord
                        ? `；服务端 ${formatter.format(new Date(item.serverRecord.endAt))}，${item.serverRecord.type}`
                        : "；服务端记录暂不可用"}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        disabled={!item.serverRecord}
                        onClick={() => onAdoptServer(item.eventId)}
                      >
                        采用服务端记录
                      </Button>
                    </div>
                  </NeuSurface>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </NeuSurface>
    </div>
  );
}
