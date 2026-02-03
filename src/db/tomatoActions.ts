"use server";

import db from "./client";
import { requireAuth } from "@/lib/auth/userAuth";
import { Prisma } from "../../generated/prisma/client";
import { checkUser } from "./userAction";
import { buildDateRangeFilter, DateRange } from "@/utils/timeUtils";
import { PomodoroData } from "@/types/pomodoro";

export async function addTomatoHistory(data: PomodoroData) {
  if (!data) {
    throw "记录为空";
  }

  const { startAt, endAt, durationMs, actualDurationMs, type, finished } = data;

  const user = await requireAuth();
  await db.pomodoroRecord.create({
    data: {
      startAt: startAt,
      endAt: endAt,
      durationMs,
      actualDurationMs,
      type,
      summary: "",
      finished,
      userId: user.id,
    },
  });
}

export async function updateTomatoHistory(
  recordId: string,
  data: Partial<PomodoroData>,
) {
  if (!recordId) {
    throw "记录 Id 为空";
  }
  if (!data) {
    throw "记录内容为空";
  }

  const user = await requireAuth();
  await db.pomodoroRecord.update({
    where: {
      id: recordId,
      userId: user.id,
    },
    data: {
      ...data,
    },
  });
}

export async function getTomatoHistory(range: DateRange, userId?: string) {
  if (!userId) {
    const user = await requireAuth();
    userId = user.id;
  } else {
    await checkUser("id", userId);
  }

  const createAt = buildDateRangeFilter(range);

  const where: Prisma.PomodoroRecordWhereInput = {
    ...(createAt ? { createAt } : {}),
    userId,
  };
  const tasklist = await db.pomodoroRecord.findMany({
    where,
    orderBy: {
      createAt: "desc",
    },
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  return tasklist;
}
