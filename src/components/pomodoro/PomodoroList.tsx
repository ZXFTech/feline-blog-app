import dayjs from "dayjs";
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
} from "lucide-react";
import type { PomodoroHistoryRecord } from "@/types/pomodoro";
import { formatMs } from "@/utils/timeUtils";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";

interface Props {
  dataSource: PomodoroHistoryRecord[];
  onAdoptServer: (eventId: string) => void;
}

const outcomeLabel = {
  COMPLETED: "完成",
  SKIPPED: "跳过",
  STOPPED: "停止",
} as const;
const syncLabel = {
  pending: "待同步",
  syncing: "同步中",
  synced: "已同步",
  failed: "同步暂停",
  conflict: "存在冲突",
} as const;

export default function PomodoroList({ dataSource, onAdoptServer }: Props) {
  if (dataSource.length === 0) {
    return (
      <NeuDiv className="p-6 text-center opacity-75">
        这个月还没有专注记录，开始一次计时后会显示在这里。
      </NeuDiv>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="番茄钟历史">
      {dataSource.map((item) => (
        <li key={item.eventId ?? item.id}>
          <NeuDiv neuType="raised" className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {item.type === "FOCUS" ? (
                  <Apple aria-hidden="true" className="text-danger" size={20} />
                ) : (
                  <Coffee
                    aria-hidden="true"
                    className="text-success"
                    size={20}
                  />
                )}
                <time className="font-bold" dateTime={item.startAt}>
                  {dayjs(item.startAt).format("YYYY-MM-DD HH:mm:ss")}
                </time>
              </div>
              <span className="flex items-center gap-1 text-sm">
                {item.syncStatus === "synced" ? (
                  <Cloud aria-hidden="true" size={16} />
                ) : item.syncStatus === "conflict" ? (
                  <CircleAlert aria-hidden="true" size={16} />
                ) : (
                  <CloudOff aria-hidden="true" size={16} />
                )}
                {syncLabel[item.syncStatus]}
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
                {item.endReason === "COMPLETED" ? (
                  <BookCheck aria-hidden="true" size={18} />
                ) : (
                  <BookX aria-hidden="true" size={18} />
                )}
                {item.endReason
                  ? outcomeLabel[item.endReason]
                  : item.finished
                    ? "完成"
                    : "旧记录"}
              </span>
            </div>
            {item.syncStatus === "conflict" && item.eventId ? (
              <div
                className="flex items-center justify-between gap-3 text-sm"
                role="alert"
              >
                <span>服务端已保存首次记录，你可以采用它并清除本地冲突。</span>
                <NeuButton onClick={() => onAdoptServer(item.eventId!)}>
                  采用服务端记录
                </NeuButton>
              </div>
            ) : null}
          </NeuDiv>
        </li>
      ))}
    </ul>
  );
}
