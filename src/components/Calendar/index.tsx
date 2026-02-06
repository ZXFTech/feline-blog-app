"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import NeuDiv from "../NeuDiv";
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/utils/timeUtils";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";

export interface RecordDate {
  color?: string;
  date: Date;
  dateStr?: string;
}

interface WorkoutCalendarProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  recordDate?: RecordDate[];
}

function Calendar({
  selectedDate = new Date(),
  onDateSelect = () => {},
  recordDate = [],
}: WorkoutCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const days: (number | { day: number; isCurrentMonth: boolean })[] = [];
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const lastDay = getLastDayOfMonth(currentMonth);
  const daysInPreviousMonth = getDaysInMonth(
    new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1),
  );

  // Add days from previous month
  for (
    let i = daysInPreviousMonth - firstDay + 1;
    i <= daysInPreviousMonth;
    i++
  ) {
    days.push({ day: i, isCurrentMonth: false });
  }

  // Add days from current month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  if (lastDay !== 6) {
    // Add days from next month
    const totalCells = days.length;
    const remainingCells = totalCells >= 35 ? 42 - totalCells : 35 - totalCells; // 5 weeks * 7 days
    for (let i = 1; i <= remainingCells; i++) {
      days.push({ day: i, isCurrentMonth: false });
    }
  }

  const previousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1),
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1),
    );
  };

  const returnToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth()));
    onDateSelect(new Date());
  };

  const formatDate = (year: number, month: number, day: number) => {
    return dayjs(new Date(year, month, day)).format("YYYY-MM-DD");
  };

  const isRecordDay = (day: number) => {
    const dateStr = formatDate(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day,
    );
    const date = recordDate.find((r) => r.dateStr === dateStr);
    return date;
  };

  const isSelectedDay = (day: number) => {
    return (
      day === selectedDate.getDate() &&
      currentMonth.getMonth() === selectedDate.getMonth() &&
      currentMonth.getFullYear() === selectedDate.getFullYear()
    );
  };

  return (
    <div className="border text-font border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {currentMonth.toLocaleDateString("zh-CN", {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={previousMonth}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={returnToToday}>今天</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center text-sm font-semibold ">
            {day}
          </div>
        ))}

        {days.map((dayObj, index) => {
          const day = typeof dayObj === "number" ? dayObj : dayObj.day;
          const isCurrentMonth =
            typeof dayObj === "number" || dayObj.isCurrentMonth;
          const record = isRecordDay(day);
          const color = record?.color || "bg-bg";
          const isSelected = isSelectedDay(day);
          return (
            <NeuDiv
              neuType={"flat"}
              key={index}
              onClick={() => {
                if (isCurrentMonth) {
                  const newDate = new Date(
                    currentMonth.getFullYear(),
                    currentMonth.getMonth(),
                    day,
                  );
                  onDateSelect(newDate);
                }
              }}
              className={`
                aspect-square rounded-md text-sm font-medium flex flex-col gap-px items-center justify-center transition-all! group duration-618 hover:transition-none! hover:bg-white
                ${!isCurrentMonth ? "text-muted-foreground bg-muted/50 opacity-50 cursor-not-allowed" : ""}
                ${isCurrentMonth && isSelected ? "bg-black! text-white" : ""}
                ${isCurrentMonth && !isSelected && !record ? "hover:bg-muted!" : ""}
                ${isCurrentMonth ? "cursor-pointer" : ""}
              `}
            >
              <span>{day}</span>
              <div
                className={cn("rounded-full w-1 h-1", {
                  color: color,
                })}
              ></div>
            </NeuDiv>
          );
        })}
      </div>
    </div>
  );
}

export default Calendar;
