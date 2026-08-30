import {
  Apple,
  BookCheck,
  BookX,
  CircleAlert,
  Cloud,
  CloudOff,
  Coffee,
  Hourglass,
  Timer,
} from 'lucide-react';
import type { PomodoroHistoryRecord } from '@/types/pomodoro';
import { formatMs } from '@/utils/timeUtils';
import NeuDiv from '../NeuDiv';

interface Props {
  dataSource: PomodoroHistoryRecord[];
  timeZone: string;
}

const outcomeLabel = {
  COMPLETED: '完成',
  SKIPPED: '跳过',
  STOPPED: '停止',
} as const;
const syncLabel = {
  pending: '待同步',
  syncing: '同步中',
  synced: '已同步',
  failed: '同步暂停',
  conflict: '存在冲突',
} as const;

const syncColor = {
  pending: 'text-warning',
  syncing: 'text-warning',
  synced: 'text-success',
  failed: 'text-warning',
  conflict: 'text-danger',
} as const;

export default function PomodoroList({ dataSource, timeZone }: Props) {
  const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  if (dataSource.length === 0) {
    return (
      <NeuDiv surface="flat" className="p-6 text-center opacity-75">
        这一天还没有番茄钟记录。
      </NeuDiv>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 pl-0!" aria-label="番茄钟历史">
      {dataSource.map((item) => (
        <li key={item.eventId ?? item.id}>
          <NeuDiv surface="flat" className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {item.type === 'FOCUS' ? (
                  <Apple aria-hidden="true" className="text-danger" size={20} />
                ) : (
                  <Coffee aria-hidden="true" className="text-success" size={20} />
                )}
                <time className="font-bold" dateTime={item.startAt}>
                  {dateTimeFormatter.format(new Date(item.startAt))}
                </time>
              </div>
              <span
                className={`flex items-center ${syncColor[item.syncStatus]}`}
                aria-label={syncLabel[item.syncStatus]}
                title={syncLabel[item.syncStatus]}
              >
                {item.syncStatus === 'synced' ? (
                  <Cloud aria-hidden="true" size={16} />
                ) : item.syncStatus === 'conflict' ? (
                  <CircleAlert aria-hidden="true" size={16} />
                ) : (
                  <CloudOff aria-hidden="true" size={16} />
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <span className="flex items-center gap-2">
                <Timer aria-hidden="true" size={18} />
                目标 {formatMs(item.durationMs)}
              </span>
              <span className="flex items-center gap-2">
                <Hourglass aria-hidden="true" size={18} />
                实际 {formatMs(item.actualDurationMs)}
              </span>
              <span className="flex items-center gap-2">
                {item.endReason === 'COMPLETED' ? (
                  <BookCheck aria-hidden="true" size={18} />
                ) : (
                  <BookX aria-hidden="true" size={18} />
                )}
                {item.endReason ? outcomeLabel[item.endReason] : item.finished ? '完成' : '旧记录'}
              </span>
            </div>
            {item.lastError ? <p className="text-sm text-danger">{item.lastError}</p> : null}
          </NeuDiv>
        </li>
      ))}
    </ul>
  );
}
