import type { PomodoroHistoryRecord, PomodoroOutboxItem } from '@/types/pomodoro';
import { localDateKey } from './month';
import { toLocalHistory } from './storage';

export interface CalendarMonth {
  year: number;
  monthIndex: number;
}

export function dateKeyAt(date: Date, timeZone: string) {
  return localDateKey(date.toISOString(), timeZone);
}

export function monthFromDateKey(dateKey: string): CalendarMonth {
  const [year, month] = dateKey.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

export function monthKey(month: CalendarMonth) {
  return `${month.year}-${String(month.monthIndex + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: CalendarMonth, amount: number): CalendarMonth {
  const absoluteMonth = month.year * 12 + month.monthIndex + amount;
  return {
    year: Math.floor(absoluteMonth / 12),
    monthIndex: ((absoluteMonth % 12) + 12) % 12,
  };
}

export function dateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, monthIndex: month - 1, day };
}

export function daysInMonth(month: CalendarMonth) {
  return new Date(Date.UTC(month.year, month.monthIndex + 1, 0)).getUTCDate();
}

export function clampDay(month: CalendarMonth, day: number) {
  return Math.min(Math.max(day, 1), daysInMonth(month));
}

export function formatDateHeading(dateKeyValue: string, todayKey: string) {
  const selected = parseDateKey(dateKeyValue);
  const today = parseDateKey(todayKey);
  const selectedUtc = Date.UTC(selected.year, selected.monthIndex, selected.day);
  const todayUtc = Date.UTC(today.year, today.monthIndex, today.day);
  const difference = Math.round((selectedUtc - todayUtc) / 86_400_000);
  const relative =
    difference === 0 ? '今天' : difference === -1 ? '昨天' : difference === 1 ? '明天' : null;
  const full = `${selected.year}年${selected.monthIndex + 1}月${selected.day}日`;
  return { full, relative };
}

export function formatDateTitle(dateKeyValue: string, todayKey: string) {
  const { full, relative } = formatDateHeading(dateKeyValue, todayKey);
  return relative ? `${full}，${relative}` : full;
}

export function nextLocalDayDelay(now: Date, timeZone: string) {
  const currentKey = dateKeyAt(now, timeZone);
  let low = now.getTime();
  let high = low + 30 * 60 * 60 * 1000;
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (dateKeyAt(new Date(middle), timeZone) === currentKey) low = middle;
    else high = middle;
  }
  return Math.max(1000, high - now.getTime() + 50);
}

export function cacheKey(userId: string, timeZone: string, month: CalendarMonth) {
  return `${userId}|${timeZone}|${monthKey(month)}`;
}

export function mergeMonthHistory(
  serverRecords: PomodoroHistoryRecord[],
  outbox: PomodoroOutboxItem[],
  targetMonth: CalendarMonth,
  timeZone: string
) {
  const targetMonthKey = monthKey(targetMonth);
  const records = new Map<string, PomodoroHistoryRecord>();
  serverRecords.forEach((record) => records.set(record.eventId ?? record.id, record));
  outbox.forEach((item) => {
    const record =
      item.status === 'conflict' && item.serverRecord
        ? { ...item.serverRecord, syncStatus: 'conflict' as const }
        : toLocalHistory(item);
    if (localDateKey(record.endAt, timeZone).startsWith(targetMonthKey))
      records.set(item.eventId, record);
  });
  return [...records.values()].sort(
    (left, right) =>
      right.startAt.localeCompare(left.startAt) ||
      (right.eventId ?? right.id).localeCompare(left.eventId ?? left.id)
  );
}

export function recordsForDate(
  records: PomodoroHistoryRecord[],
  selectedDateKey: string,
  timeZone: string
) {
  return records.filter((record) => localDateKey(record.endAt, timeZone) === selectedDateKey);
}
