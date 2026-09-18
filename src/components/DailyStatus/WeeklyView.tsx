"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { neuSurface } from "@/components/ui/neu-surface";
import { DailyData, WorkoutData } from "@/app/daily/page";
import { cn } from "@/lib/utils";

interface WeeklyViewProps {
  weeklyStatus: DailyData[];
  selectedDate: Date;
  onWeekChanged: (startDate: Date) => void;
}

interface DaySummary {
  date: string;
  totalDuration: number;
  sessionCount: number;
  activities?: WorkoutData[];
}

export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

export function WeeklyView({ weeklyStatus, selectedDate, onWeekChanged }: WeeklyViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(selectedDate));

  useEffect(() => {
    setWeekStart(getStartOfWeek(selectedDate));
  }, [selectedDate]);

  const [weeklySummary, setWeeklySummary] = useState<DaySummary[]>([]);

  const selectedDateStr = useMemo(() => {
    return selectedDate.toISOString().split("T")[0];
  }, [selectedDate]);

  useEffect(() => {
    const summary: DaySummary[] = [];
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = currentDate.toISOString().split("T")[0];

      const daySessions = weeklyStatus.find((s) => s.date?.toISOString().split("T")[0] === dateStr);

      let duration = 0;

      if (!daySessions) {
        summary.push({
          date: dateStr,
          totalDuration: 0,
          // totalCalories: 0,
          sessionCount: 0,
          activities: [],
        });
      } else {
        const workoutList: {
          [key: string]: {
            duration: number;
          };
        } = {};

        daySessions.workouts?.map((w) => {
          w.sets.map((s) => {
            duration = duration + (s.duration || 0);
          });
          workoutList[w.name] = { duration };
        });
        summary.push({
          date: dateStr,
          totalDuration: duration,
          sessionCount: daySessions?.workouts?.length || 0,
          activities: daySessions?.workouts || [],
        });
      }
    }

    setWeeklySummary(summary);
  }, [weekStart, weeklyStatus]);

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="min-w-0 space-y-4 mb-2 p-2">
      {/* Week Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex min-w-0 grow items-center justify-between gap-1">
          <Button
            materialIcon="Chevron_Left"
            onClick={() => {
              const startOfWeek = new Date(weekStart.setDate(weekStart.getDate() - 7));
              setWeekStart(startOfWeek);
              onWeekChanged(startOfWeek);
            }}
            className="p-2 hover:bg-muted rounded-md transition-colors w-5 h-5 m-0!"
          ></Button>
          <h3 className="min-w-0 grow whitespace-nowrap text-center font-semibold">
            {weekStart.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            -{" "}
            {new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </h3>
          <Button
            materialIcon="Chevron_Right"
            onClick={() => {
              const startOfWeek = new Date(weekStart.setDate(weekStart.getDate() + 7));
              onWeekChanged(startOfWeek);
              setWeekStart(startOfWeek);
            }}
            className="p-2 hover:bg-muted rounded-md transition-colors w-5 h-5 m-0!"
          ></Button>
        </div>
        <Button
          className="h-5 shrink-0 m-0!"
          materialIcon="Today"
          onClick={() => {
            const startOfWeek = getStartOfWeek(selectedDate);
            setWeekStart(startOfWeek);
            onWeekChanged(startOfWeek);
            router.replace(`${pathname}?date=${new Date().toISOString().split("T")[0]}`);
          }}
        >
          回到今天
        </Button>
      </div>
      <div className="space-y-3">
        <div className="grid min-w-0 grid-cols-7 gap-1">
          {weeklySummary.map((day, index) => (
            <button
              type="button"
              key={day.date}
              onClick={() => router.replace(`${pathname}?date=${day.date}`)}
              aria-pressed={selectedDateStr === day.date}
              className={neuSurface({
                elevation: "raised",
                className: cn(
                  "min-w-0 overflow-hidden border border-border rounded-lg p-2! flex flex-col gap-1 min-h-16 cursor-pointer text-left",
                  {
                    "bg-gray-500/20!": selectedDateStr !== day.date,
                  }
                ),
              })}
            >
              <div className="flex flex-col items-center gap-0 sm:flex-row sm:gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {dayLabels[index]}
                </span>
                <span className="text-xs font-medium">{new Date(day.date).getDate()}</span>
              </div>

              <div className="flex flex-wrap gap-1 grow items-center content-start">
                {day.activities?.map((w, i) => {
                  return (
                    <div key={w.name + w.sets.toString()} className="flex flex-wrap gap-1">
                      {w.sets.map((s, j) => {
                        return (
                          <div
                            key={w.name + "_" + i + "_" + j}
                            style={{ width: s.duration * 0.5 + "px" }}
                            className="bg-red-500 h-1 rounded-full item-shrink-0"
                          ></div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
