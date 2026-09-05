'use server';

import type { CountedTag } from '@/app/tag/page';
import { hasRootRole } from '@/lib/auth/userAuth';
import logger from '@/lib/logger/Logger';
import { actionResult } from '@/lib/server/actionResult';
import { safeErrorContext } from '@/lib/server/error';
import { parsePositiveInt } from '@/lib/server/validation';
import db from './client';

export async function getAllTags() {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  try {
    const tags = await db.tag.findMany({
      where: { userId: auth.data.id },
      orderBy: { createdAt: 'desc' },
    });
    return actionResult.success(tags);
  } catch (error) {
    logger.error(safeErrorContext('getAllTags', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取标签');
  }
}

export async function getOptionTagsById(target: 'blog' | 'todo', rawId?: unknown) {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  if (target !== 'blog' && target !== 'todo')
    return actionResult.failure('invalid_input', '标签目标无效');
  const id = rawId === undefined ? undefined : parsePositiveInt(rawId);
  if (rawId !== undefined && !id) return actionResult.failure('invalid_input', '目标 ID 无效');
  try {
    const tags = await db.tag.findMany({
      where: {
        userId: auth.data.id,
        ...(id ? { [target + 's']: { none: { [target + 'Id']: id } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return actionResult.success(tags);
  } catch (error) {
    logger.error(
      safeErrorContext('getOptionTagsById', error, {
        userId: auth.data.id,
        resourceId: id ?? undefined,
      })
    );
    return actionResult.failure('temporary_failure', '暂时无法读取标签');
  }
}

export async function getSortedTags(countBy: unknown, sort?: unknown) {
  const auth = await hasRootRole();
  if (auth.status !== 'success') return auth;
  if (countBy !== 'blogs' && countBy !== 'todos')
    return actionResult.failure('invalid_input', 'countBy 参数必须为 blogs 或 todos');
  if (sort !== undefined && sort !== 'asc' && sort !== 'desc')
    return actionResult.failure('invalid_input', 'orderBy 参数必须为 asc 或 desc');
  try {
    const result = await db.tag.findMany({
      where: { userId: auth.data.id },
      orderBy: { [countBy]: { _count: sort ?? 'desc' } },
      include: { _count: { select: { [countBy]: true } } },
    });
    let max = 0;
    const tags: CountedTag[] = result
      .filter((tag) => tag._count[countBy] !== 0)
      .map((tag) => {
        const count = tag._count[countBy] || 0;
        max = Math.max(max, count);
        return { ...tag, count };
      });
    return actionResult.success({ tags, max });
  } catch (error) {
    logger.error(safeErrorContext('getSortedTags', error, { userId: auth.data.id }));
    return actionResult.failure('temporary_failure', '暂时无法读取标签');
  }
}
