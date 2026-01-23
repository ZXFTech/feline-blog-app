"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import NeuDiv from "../NeuDiv";

interface WorkoutCalendarProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  workoutDates?: string[];
}

// todo: 需要一组颜色，用于标识任务今日完成度

export function WorkoutCalendar({
  selectedDate = new Date(),
  onDateSelect = () => {},
  workoutDates = [],
}: WorkoutCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const days: (number | { day: number; isCurrentMonth: boolean })[] = [];
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
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

  // Add days from next month
  const totalCells = days.length;
  const remainingCells = 35 - totalCells; // 6 weeks * 7 days
  for (let i = 1; i <= remainingCells; i++) {
    days.push({ day: i, isCurrentMonth: false });
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

  const formatDate = (year: number, month: number, day: number) => {
    return new Date(year, month, day).toISOString().split("T")[0];
  };

  const isWorkoutDay = (day: number) => {
    const dateStr = formatDate(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day,
    );
    return workoutDates.includes(dateStr);
  };

  const isSelectedDay = (day: number) => {
    return (
      day === selectedDate.getDate() &&
      currentMonth.getMonth() === selectedDate.getMonth() &&
      currentMonth.getFullYear() === selectedDate.getFullYear()
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          {currentMonth.toLocaleDateString("en-US", {
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
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="text-center text-sm font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {days.map((dayObj, index) => {
          const day = typeof dayObj === "number" ? dayObj : dayObj.day;
          const isCurrentMonth =
            typeof dayObj === "number" || dayObj.isCurrentMonth;

          return (
            <NeuDiv
              neuType={isCurrentMonth ? "raised" : "flat"}
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
                aspect-square rounded-md text-sm font-medium flex items-center justify-center transition-all! group duration-618 hover:transition-none! hover:bg-white!
                ${!isCurrentMonth ? "text-muted-foreground bg-muted/50 opacity-50 cursor-not-allowed" : ""}
                ${isCurrentMonth && isSelectedDay(day) ? "bg-black! text-white" : ""}
                ${isCurrentMonth && isWorkoutDay(day) && !isSelectedDay(day) ? "bg-accent text-accent-foreground" : ""}
                ${isCurrentMonth && !isSelectedDay(day) && !isWorkoutDay(day) ? "hover:bg-muted!" : ""}
                ${isCurrentMonth ? "cursor-pointer" : ""}
              `}
            >
              {day}
            </NeuDiv>
          );
        })}
      </div>
    </div>
  );
}
