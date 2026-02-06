import React from "react";
import { PomodoroRecord, PomodoroType } from "../../../generated/prisma/client";
import dayjs from "dayjs";
import NeuDiv from "../NeuDiv";
import {
  Apple,
  BookCheck,
  BookX,
  Coffee,
  Hourglass,
  Timer,
  User,
} from "lucide-react";
import { assertNever } from "@/utils/assertNever";
import { formatMs } from "@/utils/timeUtils";
import { cn } from "@/lib/utils";

interface Props {
  dataSource: (PomodoroRecord & { user: { username: string } })[];
}

function History({ dataSource }: Props) {
  const getTypeIcon = (type: PomodoroType) => {
    switch (type) {
      case "FOCUS":
        return <Apple className="text-red-800" size={20} />;
      case "SHORT":
      case "LONG":
        return <Coffee size={20} className="text-emerald-700" />;
      default:
        assertNever(type);
    }
  };

  return (
    <div className="flex gap-4 flex-col px-2">
      {dataSource.map((item) => {
        return (
          <NeuDiv
            key={item.id}
            className={cn("flex flex-col gap-4 p-4", {
              // "border-l-2 border-l-red-600!": item.type === "FOCUS",
              // "border-l-2 border-l-blue-500!": item.type === "LONG",
              // "border-l-2 border-l-green-500!": item.type === "SHORT",
            })}
          >
            <div className="flex items-center gap-2">
              <div>{getTypeIcon(item.type)}</div>
              <span className="font-bold">
                {dayjs(item.startAt).format("YYYY-MM-DD HH:mm:ss")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 items-center">
              <div className="flex items-center gap-2 min-w-0">
                <Timer size={20} />
                <span className="font-medium">{formatMs(item.durationMs)}</span>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <Hourglass size={20} />
                <span className="font-medium">
                  {formatMs(item.actualDurationMs)}
                </span>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <User size={20} />
                <span className="font-medium">{item.user.username}</span>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                {item.finished ? <BookCheck size={20} /> : <BookX size={20} />}
                <span className="font-medium">
                  {item.finished ? "完成" : "未完成"}
                </span>
              </div>
            </div>
          </NeuDiv>
        );
      })}
    </div>
  );
}

export default History;
