"use server";

import { TomatoSession } from "@/types/tomato";
import db from "./client";
import { requireAuth } from "@/lib/auth/userAuth";
import { Prisma } from "../../generated/prisma/client";
import { checkUser } from "./userAction";
import { buildDateRangeFilter, DateRange } from "@/utils/timeUtils";

export async function addTomatoHistory(session: TomatoSession) {
  if (!session) {
    throw "课程内容为空!";
  }

  const {
    startTime,
    endTime,
    focusMinutes,
    status,
    reflection,
    earlyStopReason,
  } = session;

  const user = await requireAuth();
  await db.tomatoTaskList.create({
    data: {
      startedAt: new Date(startTime),
      finishedAt: new Date(endTime),
      focusTime: focusMinutes,
      breakTime: focusMinutes,
      isFinished: status === "completed",
      summary: reflection || earlyStopReason,
      userId: user.id,
    },
  });
}

export async function updateTomatoHistory(
  sessionId: string,
  session: Partial<TomatoSession>,
) {
  if (!sessionId) {
    throw "课程 Id 为空";
  }
  if (!session) {
    throw "课程内容为空";
  }

  const user = await requireAuth();
  await db.tomatoTaskList.update({
    where: {
      id: sessionId,
      userId: user.id,
    },
    data: {
      ...session,
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

  const where: Prisma.tomatoTaskListWhereInput = {
    ...(createAt ? { createAt } : {}),
    userId,
  };
  const tasklist = await db.tomatoTaskList.findMany({
    where,
    orderBy: {
      createAt: "desc",
    },
  });

  return tasklist;
}
