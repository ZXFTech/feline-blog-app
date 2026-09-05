'use server';

import type { TagData } from '@/components/TagEditor';
import { hasTodoRoles } from '@/lib/auth/userAuth';
import logger from '@/lib/logger/Logger';
import { actionResult } from '@/lib/server/actionResult';
import { classifyDataError, safeErrorContext } from '@/lib/server/error';
import { parsePositiveInt, parseString } from '@/lib/server/validation';
import type { TodoSearchParams } from '@/types/todo';
import { Prisma } from '../../generated/prisma/client';
import db from './client';

function parseTags(tags: unknown): TagData[] | null {
  if (!Array.isArray(tags)) return null;
  const unique = new Map<string, TagData>();
  for (const value of tags) {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const content = parseString(record.content, { label: '标签', max: 50 });
    const color = parseString(record.color, { label: '颜色', max: 50 });
    if (!content || !color) return null;
    unique.set(content, { content, color });
  }
  return [...unique.values()];
}

async function upsertTags(tx: Prisma.TransactionClient, userId: string, tags: TagData[]) {
  return Promise.all(
    tags.map((tag) =>
      tx.tag.upsert({
        where: { userId_content: { userId, content: tag.content } },
        update: { color: tag.color },
        create: { content: tag.content, color: tag.color, userId },
      })
    )
  );
}

export async function getTodoList(searchParams?: TodoSearchParams) {
  const auth = await hasTodoRoles();
  if (auth.status !== 'success') return auth;
  const { finished, content, orderBy } = searchParams ?? {};
  if (orderBy !== undefined && orderBy !== 'asc' && orderBy !== 'desc') {
    return actionResult.failure('invalid_input', '排序参数无效');
  }
  const listWhere: Prisma.TodoWhereInput = {
    userId: auth.data.id,
    delete: false,
    ...(finished === null || finished === undefined ? {} : { finished }),
    ...(content?.trim() ? { content: { contains: content.trim() } } : {}),
  };
  const totalWhere = { userId: auth.data.id, delete: false } as const;
  try {
    const [todos, total, finishedTodos] = await db.$transaction([
      db.todo.findMany({
        where: listWhere,
        include: { tags: { include: { tag: true } } },
        orderBy: { createAt: orderBy ?? 'desc' },
      }),
      db.todo.count({ where: totalWhere }),
      db.todo.count({ where: { ...totalWhere, finished: true } }),
    ]);
    return actionResult.success({ todoList: todos, total, finished: finishedTodos });
  } catch (error) {
    logger.error(safeErrorContext('getTodoList', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取待办');
  }
}

export async function addTodo(input: unknown) {
  const auth = await hasTodoRoles();
  if (auth.status !== 'success') return auth;
  if (!input || typeof input !== 'object')
    return actionResult.failure('invalid_input', '待办内容无效');
  const record = input as Record<string, unknown>;
  const content = parseString(record.content, { label: '待办', max: 500 });
  const tags = parseTags(record.tags ?? []);
  if (!content || !tags) return actionResult.failure('invalid_input', '待办内容无效');
  try {
    const result = await db.$transaction(async (tx) => {
      const savedTags = await upsertTags(tx, auth.data.id, tags);
      return tx.todo.create({
        data: {
          content,
          finished: false,
          userId: auth.data.id,
          tags: {
            create: savedTags.map((tag) => ({
              assignedBy: auth.data.id,
              tag: { connect: { id: tag.id } },
            })),
          },
        },
        include: { tags: true },
      });
    });
    return actionResult.success({ result });
  } catch (error) {
    logger.error(safeErrorContext('addTodo', error, { userId: auth.data.id }));
    return (
      classifyDataError(error) ?? actionResult.failure('temporary_failure', '暂时无法创建待办')
    );
  }
}

export async function updateTodo(input: unknown) {
  const auth = await hasTodoRoles();
  if (auth.status !== 'success') return auth;
  if (!input || typeof input !== 'object')
    return actionResult.failure('invalid_input', '待办内容无效');
  const record = input as Record<string, unknown>;
  const id = parsePositiveInt(record.id);
  const content =
    record.content === undefined
      ? undefined
      : parseString(record.content, { label: '待办', max: 500 });
  const finished = record.finished;
  const tags = record.tags === undefined ? undefined : parseTags(record.tags);
  if (
    !id ||
    content === null ||
    (finished !== undefined && typeof finished !== 'boolean') ||
    tags === null
  ) {
    return actionResult.failure('invalid_input', '待办内容无效');
  }
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.todo.findFirst({
        where: { id, userId: auth.data.id, delete: false },
      });
      if (!existing) return null;
      const data: Prisma.TodoUpdateInput = {};
      if (content !== undefined) data.content = content;
      if (finished !== undefined) data.finished = finished;
      if (tags !== undefined) {
        const savedTags = await upsertTags(tx, auth.data.id, tags);
        data.tags = {
          deleteMany: {},
          create: savedTags.map((tag) => ({
            assignedBy: auth.data.id,
            tag: { connect: { id: tag.id } },
          })),
        };
      }
      return tx.todo.update({ where: { id }, data });
    });
    return result
      ? actionResult.success({ id: result.id })
      : actionResult.failure('not_found', '待办不存在');
  } catch (error) {
    logger.error(
      safeErrorContext('updateTodo', error, { userId: auth.data.id, resourceId: id ?? undefined })
    );
    return (
      classifyDataError(error) ?? actionResult.failure('temporary_failure', '暂时无法更新待办')
    );
  }
}

export async function deleteTodo(todoId: unknown) {
  const auth = await hasTodoRoles();
  if (auth.status !== 'success') return auth;
  const id = parsePositiveInt(todoId);
  if (!id) return actionResult.failure('invalid_input', '待办 ID 无效');
  try {
    const result = await db.todo.updateMany({
      where: { id, userId: auth.data.id },
      data: { delete: true },
    });
    return result.count > 0
      ? actionResult.success({ todoId: id })
      : actionResult.failure('not_found', '待办不存在');
  } catch (error) {
    logger.error(safeErrorContext('deleteTodo', error, { userId: auth.data.id, resourceId: id }));
    return actionResult.failure('temporary_failure', '暂时无法删除待办');
  }
}

export async function getTodoById(todoId: unknown) {
  const auth = await hasTodoRoles();
  if (auth.status !== 'success') return auth;
  const id = parsePositiveInt(todoId);
  if (!id) return actionResult.failure('invalid_input', '待办 ID 无效');
  try {
    const todo = await db.todo.findFirst({
      where: { id, userId: auth.data.id, delete: false },
      include: { tags: { select: { tag: { select: { content: true } } } } },
    });
    return todo
      ? actionResult.success({ ...todo, tags: todo.tags.map((item) => item.tag) })
      : actionResult.failure('not_found', '待办不存在');
  } catch (error) {
    logger.error(safeErrorContext('getTodoById', error, { userId: auth.data.id, resourceId: id }));
    return actionResult.failure('temporary_failure', '暂时无法读取待办');
  }
}

export async function getTodoByTags(tags: unknown, startDate: unknown, endDate: unknown) {
  const auth = await hasTodoRoles();
  if (auth.status !== 'success') return auth;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string'))
    return actionResult.failure('invalid_input', '标签无效');
  const start = startDate instanceof Date ? startDate : new Date(String(startDate));
  const end = endDate instanceof Date ? endDate : new Date(String(endDate));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)
    return actionResult.failure('invalid_input', '日期范围无效');
  try {
    const todos = await db.todo.findMany({
      where: {
        userId: auth.data.id,
        tags: { some: { tag: { content: { in: tags } } } },
        createAt: { gte: start, lte: end },
        delete: false,
      },
      include: { tags: { include: { tag: true } } },
    });
    return actionResult.success(todos);
  } catch (error) {
    logger.error(safeErrorContext('getTodoByTags', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取待办');
  }
}
