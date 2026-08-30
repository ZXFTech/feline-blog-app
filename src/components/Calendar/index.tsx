'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import NeuButton from '@/components/NeuButton';
import NeuDiv from '@/components/NeuDiv';
import {
  CalendarMonth,
  clampDay,
  dateKey,
  daysInMonth,
  monthFromDateKey,
  monthKey,
  parseDateKey,
  shiftMonth,
} from '@/lib/pomodoro/calendar';
import { cn } from '@/lib/utils';

export interface RecordDate {
  color?: string;
  dateKey: string;
}

interface CalendarProps {
  selectedDateKey: string;
  todayKey: string;
  visibleMonth: CalendarMonth;
  onDateSelect: (dateKey: string) => void;
  onVisibleMonthChange: (month: CalendarMonth) => void;
  recordDate?: RecordDate[];
}

interface CalendarCell {
  dateKey: string;
  day: number;
  month: CalendarMonth;
  isCurrentMonth: boolean;
}

function createCells(visibleMonth: CalendarMonth): CalendarCell[] {
  const firstWeekday = new Date(
    Date.UTC(visibleMonth.year, visibleMonth.monthIndex, 1)
  ).getUTCDay();
  const previousMonth = shiftMonth(visibleMonth, -1);
  const previousDays = daysInMonth(previousMonth);
  const currentDays = daysInMonth(visibleMonth);
  return Array.from({ length: 42 }, (_, index) => {
    const offsetDay = index - firstWeekday + 1;
    const month =
      offsetDay < 1
        ? previousMonth
        : offsetDay > currentDays
          ? shiftMonth(visibleMonth, 1)
          : visibleMonth;
    const day =
      offsetDay < 1
        ? previousDays + offsetDay
        : offsetDay > currentDays
          ? offsetDay - currentDays
          : offsetDay;
    return {
      dateKey: dateKey(month.year, month.monthIndex, day),
      day,
      month,
      isCurrentMonth: monthKey(month) === monthKey(visibleMonth),
    };
  });
}

export default function Calendar({
  selectedDateKey,
  todayKey,
  visibleMonth,
  onDateSelect,
  onVisibleMonthChange,
  recordDate = [],
}: CalendarProps) {
  const cells = useMemo(() => createCells(visibleMonth), [visibleMonth]);
  const recordDates = useMemo(
    () => new Map(recordDate.map((record) => [record.dateKey, record])),
    [recordDate]
  );
  const selectedMonthKey = monthKey(monthFromDateKey(selectedDateKey));
  const visibleMonthKey = monthKey(visibleMonth);
  const defaultGridKey =
    selectedMonthKey === visibleMonthKey
      ? selectedDateKey
      : dateKey(visibleMonth.year, visibleMonth.monthIndex, 1);
  const [focusedDateKey, setFocusedDateKey] = useState(defaultGridKey);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRequestedRef = useRef(false);
  const gridFocusKey = cells.some((cell) => cell.dateKey === focusedDateKey)
    ? focusedDateKey
    : defaultGridKey;

  useEffect(() => {
    if (!focusRequestedRef.current) return;
    focusRequestedRef.current = false;
    buttonRefs.current.get(gridFocusKey)?.focus();
  }, [cells, gridFocusKey]);

  const chooseDate = (cell: CalendarCell) => {
    if (!cell.isCurrentMonth) onVisibleMonthChange(cell.month);
    setFocusedDateKey(cell.dateKey);
    onDateSelect(cell.dateKey);
  };

  const moveFocus = (targetKey: string) => {
    const targetMonth = monthFromDateKey(targetKey);
    if (monthKey(targetMonth) !== visibleMonthKey) onVisibleMonthChange(targetMonth);
    focusRequestedRef.current = true;
    setFocusedDateKey(targetKey);
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLButtonElement>, cell: CalendarCell) => {
    const current = parseDateKey(cell.dateKey);
    const currentUtc = Date.UTC(current.year, current.monthIndex, current.day);
    const currentWeekday = new Date(currentUtc).getUTCDay();
    let targetKey: string | null = null;
    if (event.key === 'ArrowLeft')
      targetKey = new Date(currentUtc - 86_400_000).toISOString().slice(0, 10);
    if (event.key === 'ArrowRight')
      targetKey = new Date(currentUtc + 86_400_000).toISOString().slice(0, 10);
    if (event.key === 'ArrowUp')
      targetKey = new Date(currentUtc - 7 * 86_400_000).toISOString().slice(0, 10);
    if (event.key === 'ArrowDown')
      targetKey = new Date(currentUtc + 7 * 86_400_000).toISOString().slice(0, 10);
    if (event.key === 'Home')
      targetKey = new Date(currentUtc - currentWeekday * 86_400_000).toISOString().slice(0, 10);
    if (event.key === 'End')
      targetKey = new Date(currentUtc + (6 - currentWeekday) * 86_400_000)
        .toISOString()
        .slice(0, 10);
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      const targetMonth = shiftMonth(cell.month, event.key === 'PageUp' ? -1 : 1);
      targetKey = dateKey(
        targetMonth.year,
        targetMonth.monthIndex,
        clampDay(targetMonth, current.day)
      );
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseDate(cell);
      return;
    }
    if (!targetKey) return;
    event.preventDefault();
    moveFocus(targetKey);
  };

  const changeMonth = (amount: number) => {
    const nextMonth = shiftMonth(visibleMonth, amount);
    onVisibleMonthChange(nextMonth);
    const focused = parseDateKey(gridFocusKey);
    setFocusedDateKey(
      dateKey(nextMonth.year, nextMonth.monthIndex, clampDay(nextMonth, focused.day))
    );
  };

  const todayMonth = monthFromDateKey(todayKey);
  const isAtToday = selectedDateKey === todayKey && monthKey(todayMonth) === visibleMonthKey;

  return (
    <section
      className="min-w-[356px] space-y-4 rounded-lg border border-border p-2 text-font"
      aria-label="番茄钟日期"
    >
      <div className="flex items-center justify-between gap-2">
        <NeuDiv className="px-3 py-1 text-base font-semibold">
          {visibleMonth.year}年{visibleMonth.monthIndex + 1}月
        </NeuDiv>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="上个月"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="下个月"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div role="grid" aria-label={`${visibleMonth.year}年${visibleMonth.monthIndex + 1}月`}>
        <div className="grid grid-cols-7 gap-1" role="row">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <div key={day} role="columnheader" className="text-center text-sm font-semibold">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const record = cell.isCurrentMonth ? recordDates.get(cell.dateKey) : undefined;
            const isSelected = cell.dateKey === selectedDateKey;
            const isFocused = cell.dateKey === gridFocusKey;
            return (
              <div role="gridcell" key={cell.dateKey} aria-selected={isSelected}>
                <button
                  ref={(node) => {
                    if (node) buttonRefs.current.set(cell.dateKey, node);
                    else buttonRefs.current.delete(cell.dateKey);
                  }}
                  type="button"
                  tabIndex={isFocused ? 0 : -1}
                  onFocus={() => setFocusedDateKey(cell.dateKey)}
                  onClick={() => chooseDate(cell)}
                  onKeyDown={(event) => handleGridKeyDown(event, cell)}
                  aria-label={`${cell.dateKey}${record ? '，已完成专注' : ''}`}
                  className={cn(
                    'group flex aspect-square min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-md! p-1 text-sm font-medium transition-colors hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-primary',
                    !cell.isCurrentMonth && 'opacity-50',
                    isSelected && 'bg-primary text-white hover:bg-primary hover:text-white'
                  )}
                >
                  <span>{cell.day}</span>
                  <span
                    aria-hidden="true"
                    className={cn('h-1 w-1 rounded-full', record && (record.color || 'bg-success'))}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <NeuButton
          disabled={isAtToday}
          onClick={() => {
            onVisibleMonthChange(todayMonth);
            onDateSelect(todayKey);
          }}
        >
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <CalendarDays aria-hidden="true" className="shrink-0" size={18} />
            <span>回到今天</span>
          </span>
        </NeuButton>
      </div>
    </section>
  );
}
