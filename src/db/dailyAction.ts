'use server';

import { hasRootRole } from '@/lib/auth/userAuth';
import logger from '@/lib/logger/Logger';
import { actionResult } from '@/lib/server/actionResult';
import { safeErrorContext } from '@/lib/server/error';
import { parseDateOnly, parseString } from '@/lib/server/validation';
import db from './client';

export type DailyStatus = {
  date?: string;
  typingCount?: number;
  stepCount?: number;
  workouts?: {
    name: string;
    sets: {
      reps?: number | null;
      duration: number;
      weight?: number | null;
      calories?: number;
      order?: number | null;
    }[];
  }[];
};

const todayKey = () => new Date().toISOString().slice(0, 10);

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: unknown) {
  return nonNegativeNumber(value) && Number.isInteger(value);
}

function parseDailyInput(input: unknown): DailyStatus | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  if (record.date !== undefined && !parseDateOnly(record.date)) return null;
  if (record.typingCount !== undefined && !nonNegativeInteger(record.typingCount)) return null;
  if (record.stepCount !== undefined && !nonNegativeInteger(record.stepCount)) return null;
  if (record.workouts !== undefined && !Array.isArray(record.workouts)) return null;
  const workouts: NonNullable<DailyStatus['workouts']> = [];
  for (const value of (record.workouts as unknown[] | undefined) ?? []) {
    if (!value || typeof value !== 'object') return null;
    const workout = value as Record<string, unknown>;
    const name = parseString(workout.name, { label: '训练名称', max: 191 });
    if (!name || !Array.isArray(workout.sets)) return null;
    const sets: NonNullable<DailyStatus['workouts']>[number]['sets'] = [];
    for (const setValue of workout.sets) {
      if (!setValue || typeof setValue !== 'object') return null;
      const set = setValue as Record<string, unknown>;
      if (!nonNegativeInteger(set.duration)) return null;
      if (set.reps !== undefined && set.reps !== null && !nonNegativeInteger(set.reps)) return null;
      if (set.weight !== undefined && set.weight !== null && !nonNegativeNumber(set.weight))
        return null;
      if (set.calories !== undefined && !nonNegativeInteger(set.calories)) return null;
      if (set.order !== undefined && set.order !== null && !nonNegativeInteger(set.order))
        return null;
      sets.push({
        duration: set.duration as number,
        reps: set.reps as number | null | undefined,
        weight: set.weight as number | null | undefined,
        calories: set.calories as number | undefined,
        order: set.order as number | null | undefined,
      });
    }
    workouts.push({ name, sets });
  }
  return {
    date: record.date as string | undefined,
    typingCount: record.typingCount as number | undefined,
    stepCount: record.stepCount as number | undefined,
    workouts,
  };
}

export async function getDailyStatus(date?: unknown) {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  const parsedDate = parseDateOnly(date ?? todayKey());
  if (!parsedDate) return actionResult.failure('invalid_input', '日期无效');
  try {
    const result = await db.dailyStat.findUnique({
      where: { date: parsedDate },
      include: { workouts: { include: { sets: true } } },
    });
    return actionResult.success(result);
  } catch (error) {
    logger.error(safeErrorContext('getDailyStatus', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取日常记录');
  }
}

export async function getDailyRangeStatus(startDate?: unknown, endDate?: unknown) {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  const start = parseDateOnly(startDate ?? todayKey());
  const end = parseDateOnly(endDate ?? todayKey());
  if (!start || !end || start > end) return actionResult.failure('invalid_input', '日期范围无效');
  try {
    const result = await db.dailyStat.findMany({
      where: { date: { gte: start, lte: end } },
      include: { workouts: { include: { sets: true } } },
    });
    return actionResult.success(result);
  } catch (error) {
    logger.error(safeErrorContext('getDailyRangeStatus', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取日常记录');
  }
}

export async function updateDailyStatus(input: unknown) {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  const parsed = parseDailyInput(input);
  if (!parsed) return actionResult.failure('invalid_input', '日常记录内容无效');
  const formatDate = parseDateOnly(parsed.date ?? todayKey())!;
  const { workouts = [], typingCount, stepCount } = parsed;
  try {
    const result = await db.$transaction(async (tx) => {
      const daily = await tx.dailyStat.upsert({
        where: { date: formatDate },
        update: {
          ...(typingCount !== undefined ? { typingCount } : {}),
          ...(stepCount !== undefined ? { stepCount } : {}),
        },
        create: {
          date: formatDate,
          ...(typingCount !== undefined ? { typingCount } : {}),
          ...(stepCount !== undefined ? { stepCount } : {}),
        },
      });
      const names = [...new Set(workouts.map((workout) => workout.name))];
      if (names.length === 0) return daily;
      await tx.exercise.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
      const exercises = await tx.exercise.findMany({ where: { name: { in: names } } });
      await tx.workoutItem.createMany({
        data: exercises.map((exercise) => ({
          exerciseId: exercise.id,
          name: exercise.name,
          dailyStatId: daily.id,
        })),
        skipDuplicates: true,
      });
      const items = await tx.workoutItem.findMany({
        where: {
          dailyStatId: daily.id,
          exerciseId: { in: exercises.map((exercise) => exercise.id) },
        },
      });
      const exerciseByName = new Map(exercises.map((exercise) => [exercise.name, exercise.id]));
      const itemByExercise = new Map(items.map((item) => [item.exerciseId, item.id]));
      const sets = workouts.flatMap((workout) => {
        const exerciseId = exerciseByName.get(workout.name);
        const workoutItemId = exerciseId === undefined ? undefined : itemByExercise.get(exerciseId);
        if (workoutItemId === undefined) throw new Error('WORKOUT_ITEM_MISSING');
        return workout.sets.map((set, index) => ({
          workoutItemId,
          order: set.order ?? index,
          duration: set.duration,
          reps: set.reps ?? null,
          weight: set.weight ?? null,
          calories: set.calories ?? 0,
        }));
      });
      if (sets.length > 0) await tx.workoutSet.createMany({ data: sets });
      return daily;
    });
    return actionResult.success(result);
  } catch (error) {
    logger.error(safeErrorContext('updateDailyStatus', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法保存日常记录');
  }
}
