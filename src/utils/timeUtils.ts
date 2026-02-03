import type { Phase, PomodoroState } from "@/types/pomodoro";
import { PomodoroType } from "../../generated/prisma/enums";
export interface DateRange {
  startTime?: Date;
  endTime?: Date;
}

export function buildDateRangeFilter(range: DateRange) {
  const { startTime, endTime } = range;

  if (!startTime && !endTime) return undefined;

  return {
    ...(startTime ? { gte: startTime } : {}),
    ...(endTime ? { lte: endTime } : {}),
  };
}

export function formatMs(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function phaseLabel(state: PomodoroState) {
  switch (state.phase) {
    case "idle":
      return "未开始";
    case "focus":
      return "专注";
    case "short_break":
      return "短休息";
    case "long_break":
      return "长休息";
  }
}

export function phaseType(phase: Phase): PomodoroType | "" {
  switch (phase) {
    case "idle":
      return "";
    case "focus":
      return "FOCUS";
    case "short_break":
      return "SHORT";
    case "long_break":
      return "LONG";
  }
}
