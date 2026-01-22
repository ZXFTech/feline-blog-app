"use server";

import db from "./client";
import logger from "@/lib/logger/Logger";

export type DailyStatus = {
  date?: string;
  typingCount?: number;
  stepCount?: number;
  workouts?: {
    name: string;
    sets: { reps: number; duration: number }[];
  }[];
};

// 获取 daily 状态不需要认证
export async function getDailyStatus(date?: string) {
  try {
    if (!date) {
      const today = new Date();
      date = today.toISOString().split("T")[0];
    }

    const formatStartDate = new Date(date);
    const result = await db.dailyStat.findUnique({
      where: {
        date: formatStartDate,
      },
      include: {
        workouts: {
          include: {
            sets: true,
          },
        },
      },
    });

    return result;
  } catch (error) {
    logger.error("获取日常状态失败", error);
    throw error;
  }
}

export async function getDailyRangeStatus(
  startDate?: string,
  endDate?: string,
) {
  try {
    if (!startDate) {
      const today = new Date();
      startDate = today.toISOString().split("T")[0];
    }
    if (!endDate) {
      const today = new Date();
      endDate = today.toISOString().split("T")[0];
    }
    const formatStartDate = new Date(startDate);
    const formatEndDate = new Date(endDate);
    const result = await db.dailyStat.findMany({
      where: {
        date: {
          gte: formatStartDate,
          lte: formatEndDate,
        },
      },
      include: {
        workouts: {
          include: {
            sets: true,
          },
        },
      },
    });

    return result;
  } catch (error) {
    logger.error("获取范围日期的日常状态失败", error);
    throw error;
  }
}

export async function updateDailyStatus({
  date,
  workouts,
  ...status
}: DailyStatus) {
  try {
    if (!date) {
      const today = new Date();
      date = today.toISOString().split("T")[0];
    }
    const formatDate = new Date(date);
    const a = await db.dailyStat.findUnique({
      where: {
        date: formatDate,
      },
    });
    const result = await db.$transaction(async (tx) => {
      const daily = await tx.dailyStat.upsert({
        where: {
          date: formatDate,
        },
        update: {
          ...status,
        },
        create: {
          date: formatDate,
          ...status,
        },
      });

      const exerciseNames = [...new Set(workouts?.map((w) => w.name) || [])];

      await tx.exercise.createMany({
        data: exerciseNames.map((name) => ({ name })),
        skipDuplicates: true,
      });

      const exercises = await tx.exercise.findMany({
        where: {
          name: { in: exerciseNames },
        },
      });

      const exerciseMap = new Map<string, number>(
        exercises.map((ex) => [ex.name, ex.id]),
      );

      await tx.workoutItem.createMany({
        data: exercises.map((ex) => ({
          exerciseId: ex.id,
          name: ex.name,
          dailyStatId: daily.id,
        })),
        skipDuplicates: true,
      });

      const items = await tx.workoutItem.findMany({
        where: {
          dailyStatId: daily.id,
        },
      });

      const itemMap = new Map<string, number>(
        items.map((item) => [
          `${item.dailyStatId}-${item.exerciseId}`,
          item.id,
        ]),
      );

      const setsData = workouts?.flatMap((workout) => {
        const exercise = exerciseMap.get(workout.name);
        const item = itemMap.get(`${daily.id}-${exercise}`);

        return workout.sets.map((reps, i) => {
          return {
            workoutItemId: item!,
            order: i,
            ...reps,
          };
        });
      });

      await tx.workoutSet.createMany({
        data: setsData || [],
      });
      return daily;
    });

    return result;
  } catch (error) {
    logger.error("更新日常状态失败", error);
    throw error;
  }
}
