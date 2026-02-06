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

/**
 * 根据毫秒数, 返回分秒格式 xx:xx
 * @param ms 时间 ms
 * @returns
 */
export function formatMs(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 根据番茄时钟 phase 标记返回指定提示词
 * @param state 番茄时钟 state
 * @returns 番茄时钟提示词
 */
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

/**
 * 根据番茄时钟 phase 标记返回后端 Pomodoro Type 枚举词
 * @param phase 番茄时钟 phase 标记
 * @returns
 */
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

/**
 * 根据传入的日期, 获取本月有多少天
 * @param date 所在月的日期
 * @returns 本月天数
 */
export const getDaysInMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

/**
 * 根据传入的日期, 获取本月第一天是周几
 * @param date 所在月的日期
 * @returns 本月第一天的对应的星期
 */
export const getFirstDayOfMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
};

/**
 * 根据传入的日期, 获取本月第最后一天是周几
 * @param date 所在月的日期
 * @returns 本月最后一天的对应的星期
 */
export const getLastDayOfMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDay();
};

/**
 * 根据传入的日期, 获取本月第一天是周几
 * @param date 所在月的日期
 * @returns 本月第一天的对应的星期
 */
export const getFirstDateOfMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

/**
 * 根据传入的日期, 获取本月第最后一天是周几
 * @param date 所在月的日期
 * @returns 本月最后一天的对应的星期
 */
export const getLastDateOfMonth = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};
