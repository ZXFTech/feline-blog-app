'use server';

import { Prisma } from '../../generated/prisma/client';
import { PomodoroEndReason, PomodoroType } from '../../generated/prisma/enums';
import { requireAuth } from '@/lib/auth/userAuth';
import type {
  PomodoroHistoryRecord,
  SavePomodoroInput,
  SavePomodoroResult,
} from '@/types/pomodoro';
import db from './client';
import { actionResult } from '@/lib/server/actionResult';
import logger from '@/lib/logger/Logger';
import { safeErrorContext } from '@/lib/server/error';
import { parseString } from '@/lib/server/validation';

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeRecord(record: {
  id: string;
  eventId: string | null;
  type: PomodoroType;
  endReason: PomodoroEndReason | null;
  finished: boolean;
  startAt: Date;
  endAt: Date;
  durationMs: number;
  actualDurationMs: number;
}): PomodoroHistoryRecord {
  return {
    ...record,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt.toISOString(),
    syncStatus: 'synced',
  };
}

function parseInput(input: SavePomodoroInput) {
  if (!input || !UUID_PATTERN.test(input.eventId) || !input.startAt || !input.endAt) return null;
  if (!Object.values(PomodoroType).includes(input.type)) return null;
  if (!Object.values(PomodoroEndReason).includes(input.endReason)) return null;
  if (
    !Number.isFinite(input.targetDurationMs) ||
    input.targetDurationMs <= 0 ||
    input.targetDurationMs > MAX_DURATION_MS
  )
    return null;
  if (
    !Number.isFinite(input.remainingMs) ||
    input.remainingMs < 0 ||
    input.remainingMs > input.targetDurationMs
  )
    return null;
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (
    !Number.isFinite(startAt.getTime()) ||
    !Number.isFinite(endAt.getTime()) ||
    endAt.getTime() < startAt.getTime()
  )
    return null;
  return {
    eventId: input.eventId,
    type: input.type,
    endReason: input.endReason,
    startAt,
    endAt,
    durationMs: input.targetDurationMs,
    actualDurationMs: input.targetDurationMs - input.remainingMs,
    finished: input.endReason === PomodoroEndReason.COMPLETED,
  };
}

function sameContent(
  existing: PomodoroHistoryRecord,
  input: NonNullable<ReturnType<typeof parseInput>>
) {
  return (
    existing.type === input.type &&
    existing.endReason === input.endReason &&
    new Date(existing.startAt).getTime() === input.startAt.getTime() &&
    new Date(existing.endAt).getTime() === input.endAt.getTime() &&
    existing.durationMs === input.durationMs &&
    existing.actualDurationMs === input.actualDurationMs
  );
}

export async function savePomodoroRecord(input: SavePomodoroInput): Promise<SavePomodoroResult> {
  const auth = await requireAuth();
  if (auth.status !== 'success') {
    return auth.status === 'conflict'
      ? { status: 'temporary_failure', message: '暂时无法验证登录状态' }
      : { status: auth.status, message: auth.message };
  }
  const user = auth.data;
  const data = parseInput(input);
  if (!data) return { status: 'invalid_input', message: '番茄记录内容无效' };
  try {
    const created = await db.pomodoroRecord.create({
      data: { ...data, summary: '', userId: user.id },
    });
    return { status: 'created', record: normalizeRecord(created) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await db.pomodoroRecord.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: data.eventId } },
      });
      if (!existing) return { status: 'temporary_failure', message: '记录暂时不可用' };
      const record = normalizeRecord(existing);
      return sameContent(record, data)
        ? { status: 'already_exists', record }
        : { status: 'conflict', record, message: '服务端已有不同记录' };
    }
    logger.error(safeErrorContext('savePomodoroRecord', error, { userId: user.id }));
    return { status: 'temporary_failure', message: '暂时无法保存番茄记录' };
  }
}

export async function getTomatoHistory(input: { startUtc: string; endUtc: string }) {
  const auth = await requireAuth();
  if (auth.status !== 'success') return auth;
  const user = auth.data;
  const startUtc = new Date(input.startUtc);
  const endUtc = new Date(input.endUtc);
  if (
    !Number.isFinite(startUtc.getTime()) ||
    !Number.isFinite(endUtc.getTime()) ||
    startUtc >= endUtc
  )
    return actionResult.failure('invalid_input', '月份范围无效');
  try {
    const records = await db.pomodoroRecord.findMany({
      where: { userId: user.id, endAt: { gte: startUtc, lt: endUtc } },
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    });
    return actionResult.success(records.map(normalizeRecord));
  } catch (error) {
    logger.error(safeErrorContext('getTomatoHistory', error, { userId: user.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取番茄记录');
  }
}

/** Legacy name kept for callers outside the Pomodoro core loop. */
export async function addTomatoHistory(input: SavePomodoroInput) {
  return savePomodoroRecord(input);
}

export async function updateTomatoHistory(recordId: string, data: unknown) {
  const auth = await requireAuth();
  if (auth.status !== 'success') return auth;
  if (!data || typeof data !== 'object')
    return actionResult.failure('invalid_input', '记录内容无效');
  const summary = parseString((data as Record<string, unknown>).summary, {
    label: '总结',
    max: 65_535,
    trim: false,
    allowEmpty: true,
  });
  if (summary === null) return actionResult.failure('invalid_input', '记录内容无效');
  try {
    const result = await db.pomodoroRecord.updateMany({
      where: { id: recordId, userId: auth.data.id },
      data: { summary },
    });
    return result.count
      ? actionResult.success({ id: recordId })
      : actionResult.failure('not_found', '记录不存在');
  } catch (error) {
    logger.error(
      safeErrorContext('updateTomatoHistory', error, { userId: auth.data.id, resourceId: recordId })
    );
    return actionResult.failure('temporary_failure', '暂时无法更新番茄记录');
  }
}
