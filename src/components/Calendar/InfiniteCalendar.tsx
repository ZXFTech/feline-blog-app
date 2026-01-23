"use client";

import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import classNames from "classnames";

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  dayName: string;
  isToday: boolean;
  isSelected: boolean;
  month: number;
  year: number;
}

interface CalendarWeek {
  weekIndex: number;
  days: CalendarDay[];
}

interface InfiniteCalendarProps {
  initialDate?: Date;
}

function InfiniteCalendar({ initialDate }: InfiniteCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialDate || new Date(),
  );
  const [centerDate, setCenterDate] = useState<Date>(initialDate || new Date()); // 当前视图中心的日期（吸附效果）
  const [visibleDays, setVisibleDays] = useState<CalendarDay[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollTimeoutRef = useRef<NodeJS.Timeout>(null);

  // Generate visible days around center date
  const generateDays = useCallback(() => {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 计算中心日期相对于今天的偏移
    const centerOffset = Math.floor(
      (centerDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Generate 120 days (60 before and 60 after center)
    for (let i = -60; i <= 60; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + centerOffset + i);

      const dayOfMonth = date.getDate();
      const dayName = date.toLocaleDateString("zh-CN", { weekday: "short" });
      const isToday = date.toDateString() === today.toDateString();
      const isSelected = date.toDateString() === selectedDate.toDateString();

      days.push({
        date,
        dayOfMonth,
        dayName,
        isToday,
        isSelected,
        month: date.getMonth(),
        year: date.getFullYear(),
      });
    }

    return days;
  }, [centerDate, selectedDate]);

  // Initialize with today's date
  useEffect(() => {
    setVisibleDays(generateDays());
  }, [generateDays]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const itemsWidth = container.children[0]?.clientWidth || 50;

    container.scrollLeft = 61 * itemsWidth - container.clientWidth / 2;
  }, [visibleDays]);

  // 处理日期选择 - 同时更新选中状态和中心位置
  const handleSelectDay = (day: CalendarDay) => {
    setSelectedDate(day.date);
    setCenterDate(day.date);
    setDateInput("");
  };

  // 处理日期输入
  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateInput(e.target.value);
  };

  const handleDateInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateInput) return;

    const inputDate = new Date(dateInput);
    if (isNaN(inputDate.getTime())) {
      alert("请输入有效的日期 (YYYY-MM-DD)");
      return;
    }

    inputDate.setHours(0, 0, 0, 0);
    setSelectedDate(inputDate);
    setCenterDate(inputDate);
    setDateInput("");
  };

  // 处理滚动事件，实现吸附效果
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setIsScrolling(true);
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [visibleDays]);

  // 滚动到指定日期
  const scrollToDate = (date: Date) => {
    const ref = dayRefs.current.get(date.toISOString());
    if (ref && scrollContainerRef.current) {
      ref.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  };

  // 处理键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() - 1);
        scrollToDate(newDate);
      } else if (e.key === "ArrowRight") {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + 1);
        scrollToDate(newDate);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDate]);

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <div className="space-y-6">
        {/* 头部 */}
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground">
                {selectedDate.toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </h1>
              <p className="text-base text-muted-foreground mt-2">
                {selectedDate.toLocaleDateString("zh-CN", {
                  weekday: "long",
                })}
              </p>
            </div>
          </div>

          {/* 日期输入表单 */}
          <form onSubmit={handleDateInputSubmit} className="flex gap-2">
            <div className="relative flex-1 max-w-xs">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={dateInput}
                onChange={handleDateInputChange}
                placeholder="选择日期"
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              跳转
            </button>
          </form>
        </div>

        {/* 日历容器 */}
        <div className="relative bg-card rounded-lg border border-border overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex overflow-x-auto scroll-smooth pb-4 pt-4 px-4"
          >
            {visibleDays.map((day) => (
              <div
                key={day.date.toISOString()}
                ref={(el) => {
                  if (el) dayRefs.current.set(day.date.toISOString(), el);
                }}
                className={`flex-shrink-0 cursor-pointer transition-all duration-300 w-[50px]`}
                onClick={() => scrollToDate(day.date)}
              >
                <div
                  className={classNames(
                    "w-full h-full rounded-lg flex flex-col items-center justify-center p-2 transition-all duration-300 border-2 font-medium ",
                    {
                      "bg-red-500!": day.isSelected,
                    },
                  )}
                >
                  <span className="text-xs opacity-80">{day.dayName}</span>
                  <span className="text-2xl font-bold mt-2">
                    {day.dayOfMonth}
                  </span>
                  <span>
                    {day.month + 1}/{day.year}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* 状态提示 */}
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-foreground">
            中心日期：
            <span className="text-primary">
              {centerDate.toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {isScrolling
              ? "自动对齐中心最近的日期..."
              : "滑动日历、点击日期或输入日期进行导航"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default InfiniteCalendar;
