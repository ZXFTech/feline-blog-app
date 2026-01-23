"use client";

import {
  getStartOfWeek,
  WeeklyView,
} from "@/components/DailyStatus/WeeklyView";
import NeuButton from "@/components/NeuButton";
import { toast } from "@/components/ProMessage";
import {
  getDailyStatus,
  getDailyRangeStatus,
  updateDailyStatus,
} from "@/db/dailyAction";
import logger from "@/lib/logger/Logger";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import DailySummary from "../../components/DailyStatus/DailySummary";
import WorkoutEditor, {
  WorkoutItemData,
} from "../../components/DailyStatus/WorkoutEditor";
import Content from "@/components/Content";

export type WorkoutSetData = {
  reps?: number | null;
  weight?: number | null;
  order?: number | null;
  calories: number;
  duration: number;
};

export type WorkoutData = {
  name: string;
  sets: WorkoutSetData[];
};

export type DailyData = {
  createdAt?: Date;
  date?: Date;
  typingCount?: number;
  stepCount?: number;
  workouts?: WorkoutData[];
};

export interface WorkoutSet {
  id: number;
  duration: number;
  reps: number;
  order?: number;
  weight?: number;
  calories: number;
  workoutItemId: number;
}

export interface WorkoutItem {
  id: number;
  createdAt?: Date;
  name: string;
  exerciseId: number;
  dailyStatId: number;
  sets: WorkoutSet[];
}

export interface DailyStatus {
  id: number;
  date: Date;
  typingCount: number;
  stepCount: number;
  createdAt: Date;
  updatedAt: Date;
  workouts: WorkoutItem[];
}

function Daily() {
  const searchParams = useSearchParams();

  const dateParams = searchParams.get("date");

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);

  const [dailyStatus, setDailyStatus] = useState<DailyData | null>();
  const [weeklyStatus, setWeeklyStatus] = useState<DailyData[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(
    dateParams ? new Date(dateParams) : new Date(),
  );

  useEffect(() => {
    if (!dateParams) return;
    setSelectedDate(new Date(dateParams));
  }, [dateParams]);

  useEffect(() => {
    const getData = async () => {
      try {
        setDailyLoading(true);
        const dailyData = await getDailyStatus(
          selectedDate.toISOString().split("T")[0],
        );
        setDailyStatus(dailyData);
      } catch (error) {
        logger.error("获取今日数据出错.", error);
        toast.error("获取今日数据出错");
      } finally {
        setDailyLoading(false);
      }
    };

    getData();
  }, [selectedDate]);

  const onWeekChanged = (startOfWeek: Date) => {
    getWeeklyData(startOfWeek);
  };

  const getWeeklyData = async (date?: Date) => {
    const startOfWeek = getStartOfWeek(date ? date : new Date());
    const weeklyData = await getDailyRangeStatus(
      startOfWeek.toString(),
      new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toString(),
    );
    setWeeklyStatus(weeklyData);
  };

  useEffect(() => {
    getWeeklyData();
  }, []);

  const handleSubmit = async (data: WorkoutItemData) => {
    // 提交训练数据的逻辑
    try {
      setLoading(true);
      await updateDailyStatus({
        workouts: [
          {
            name: data.workoutItemName || "随便动动",
            sets: Array.from({ length: data.sets || 0 }, () => ({
              reps: data.reps || 0,
              duration: data.duration_minutes,
              calories: data.calories_burned,
              weight: data.weight_kg,
              order: data.sets,
            })),
          },
        ],
        stepCount: 10000,
        typingCount: 5000,
      });
      setVisible(false);
      toast.success("训练数据已保存");
    } catch (error) {
      logger.error("保存训练数据失败", error);
      toast.error("保存训练数据失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Content>
      <div className="flex flex-col gap-2">
        <div>
          <NeuButton onClick={() => setVisible(true)}>添加新训练</NeuButton>
          <NeuButton buttonType="link" href="/playground/workItem">
            训练项目管理
          </NeuButton>
        </div>
        <WeeklyView
          weeklyStatus={weeklyStatus}
          onWeekChanged={onWeekChanged}
          onDateSelect={(date) => setSelectedDate(date)}
          selectedDate={selectedDate}
        />
        <DailySummary dailyData={dailyStatus} loading={dailyLoading} />
        <WorkoutEditor
          visible={visible}
          onSubmit={handleSubmit}
          onClose={() => {
            setVisible(false);
            setLoading(false);
          }}
          loading={loading}
        />
      </div>
    </Content>
  );
}

export default Daily;
