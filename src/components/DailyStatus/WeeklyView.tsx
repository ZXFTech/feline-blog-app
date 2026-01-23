"use client";

import { useEffect, useMemo, useState } from "react";
import NeuButton from "../NeuButton";
import classNames from "classnames";
import { usePathname, useRouter } from "next/navigation";
import NeuDiv from "../NeuDiv";
import { DailyData, WorkoutData } from "@/app/daily/page";

interface WeeklyViewProps {
  weeklyStatus: DailyData[];
  onDateSelect: (date: Date) => void;
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

export function WeeklyView({
  weeklyStatus,
  selectedDate,
  onWeekChanged,
}: WeeklyViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [weekStart, setWeekStart] = useState<Date>(
    getStartOfWeek(selectedDate),
  );

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

      const daySessions = weeklyStatus.find(
        (s) => s.date?.toISOString().split("T")[0] === dateStr,
      );

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
    <div className="space-y-4 mb-2 p-2">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center justify-start gap-4">
          <NeuButton
            icon="Chevron_Left"
            onClick={() => {
              const startOfWeek = new Date(
                weekStart.setDate(weekStart.getDate() - 7),
              );
              setWeekStart(startOfWeek);
              onWeekChanged(startOfWeek);
            }}
            className="p-2 hover:bg-muted rounded-md transition-colors w-5 h-5 m-0!"
          ></NeuButton>
          <h3 className="font-semibold text-center w-50">
            {weekStart.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            -{" "}
            {new Date(
              weekStart.getTime() + 6 * 24 * 60 * 60 * 1000,
            ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </h3>
          <NeuButton
            icon="Chevron_Right"
            onClick={() => {
              const startOfWeek = new Date(
                weekStart.setDate(weekStart.getDate() + 7),
              );
              onWeekChanged(startOfWeek);
              setWeekStart(startOfWeek);
            }}
            className="p-2 hover:bg-muted rounded-md transition-colors w-5 h-5 m-0!"
          ></NeuButton>
        </div>
        <NeuButton
          className="h-5 m-0!"
          icon="Today"
          onClick={() => {
            const startOfWeek = getStartOfWeek(selectedDate);
            setWeekStart(startOfWeek);
            onWeekChanged(startOfWeek);
            router.replace(
              `${pathname}?date=${new Date().toISOString().split("T")[0]}`,
            );
          }}
        >
          回到今天
        </NeuButton>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-7 gap-2">
          {weeklySummary.map((day, index) => (
            <NeuDiv
              key={day.date}
              onClick={() => router.replace(`${pathname}?date=${day.date}`)}
              className={classNames(
                "border border-border rounded-lg p-3! flex flex-col gap-1 min-h-16 cursor-pointer",
                {
                  "bg-gray-500/20!": selectedDateStr !== day.date,
                },
              )}
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {dayLabels[index]}
                </span>
                <span className="text-xs font-medium">
                  {new Date(day.date).getDate()}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 grow items-center content-start">
                {day.activities?.map((w, i) => {
                  return (
                    <div
                      key={w.name + w.sets.toString()}
                      className="flex flex-wrap gap-1"
                    >
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
            </NeuDiv>
          ))}
        </div>
      </div>
    </div>
  );
}
