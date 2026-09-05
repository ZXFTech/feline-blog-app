'use server';

import type { TagData } from '@/components/TagEditor';
import { hasBlogRoles, resolveCurrentUser } from '@/lib/auth/userAuth';
import logger from '@/lib/logger/Logger';
import { actionResult, type ActionResult } from '@/lib/server/actionResult';
import { classifyDataError, isKnownPrismaError, safeErrorContext } from '@/lib/server/error';
import { parsePositiveInt, parseString } from '@/lib/server/validation';
import { Prisma } from '../../generated/prisma/client';
import db from './client';

const publicAuthorSelect = { id: true, username: true, avatar: true } as const;
const tagInclude = { include: { tag: true } } as const;

function parseTags(tags: unknown): TagData[] | null {
  if (!Array.isArray(tags)) return null;
  const parsed: TagData[] = [];
  const seen = new Set<string>();
  for (const value of tags) {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const content = parseString(record.content, { label: '标签', max: 50 });
    const color = parseString(record.color, { label: '颜色', max: 50 });
    if (!content || !color) return null;
    if (!seen.has(content)) parsed.push({ content, color });
    seen.add(content);
  }
  return parsed;
}

function parseBlogInput(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const title = parseString(record.title, { label: '标题', max: 191 });
  const content = parseString(record.content, {
    label: '正文',
    max: Number.MAX_SAFE_INTEGER,
    trim: false,
    allowEmpty: true,
  });
  const tags = parseTags(record.tags ?? []);
  return title && content !== null && tags ? { title, content, tags } : null;
}

async function upsertTags(tx: Prisma.TransactionClient, userId: string, tags: TagData[]) {
  return Promise.all(
    tags.map((tag) =>
      tx.tag.upsert({
        where: { userId_content: { userId, content: tag.content } },
        update: { color: tag.color },
        create: { userId, content: tag.content, color: tag.color },
      })
    )
  );
}

export async function createBlog(input: unknown): Promise<ActionResult<{ blogId: number }>> {
  const auth = await hasBlogRoles();
  if (auth.status !== 'success') return auth;
  const parsed = parseBlogInput(input);
  if (!parsed) return actionResult.failure('invalid_input', '文章内容无效');
  try {
    const result = await db.$transaction(async (tx) => {
      const tags = await upsertTags(tx, auth.data.id, parsed.tags);
      return tx.blog.create({
        data: {
          title: parsed.title,
          content: parsed.content,
          authorId: auth.data.id,
          tags: {
            create: tags.map((tag) => ({
              assignedBy: auth.data.id,
              tag: { connect: { id: tag.id } },
            })),
          },
        },
      });
    });
    return actionResult.success({ blogId: result.id });
  } catch (error) {
    logger.error(safeErrorContext('createBlog', error, { userId: auth.data.id }));
    return (
      classifyDataError(error) ?? actionResult.failure('temporary_failure', '暂时无法创建文章')
    );
  }
}

export async function getBlogById(id: unknown) {
  const blogId = parsePositiveInt(id);
  if (!blogId) return actionResult.failure('invalid_input', '文章 ID 无效');
  const auth = await resolveCurrentUser();
  if (auth.status === 'temporary_failure') return auth;
  const userId = auth.status === 'success' ? auth.data.id : null;
  try {
    const blog = await db.blog.findFirst({
      where: { id: blogId, delete: false },
      include: { author: { select: publicAuthorSelect }, tags: tagInclude },
    });
    if (!blog || !userId) return actionResult.success({ blog, isLiked: false, isFavorite: false });
    const isLiked = await db.blogLike.findUnique({ where: { blogId_userId: { userId, blogId } } });
    const isFavorite = await db.blogFavorite.findUnique({
      where: { blogId_userId: { userId, blogId } },
    });
    return actionResult.success({ blog, isLiked: !!isLiked, isFavorite: !!isFavorite });
  } catch (error) {
    logger.error(
      safeErrorContext('getBlogById', error, { resourceId: blogId, ...(userId ? { userId } : {}) })
    );
    return actionResult.failure('temporary_failure', '暂时无法读取文章');
  }
}

export async function updateBlogById(
  id: unknown,
  input: unknown
): Promise<ActionResult<{ blogId: number }>> {
  const auth = await hasBlogRoles();
  if (auth.status !== 'success') return auth;
  const blogId = parsePositiveInt(id);
  const parsed = parseBlogInput(input);
  if (!blogId || !parsed) return actionResult.failure('invalid_input', '文章内容无效');
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.blog.findFirst({
        where: { id: blogId, authorId: auth.data.id, delete: false },
      });
      if (!existing) return null;
      const tags = await upsertTags(tx, auth.data.id, parsed.tags);
      return tx.blog.update({
        where: { id: blogId },
        data: {
          title: parsed.title,
          content: parsed.content,
          tags: {
            deleteMany: {},
            create: tags.map((tag) => ({
              assignedBy: auth.data.id,
              tag: { connect: { id: tag.id } },
            })),
          },
        },
      });
    });
    return result
      ? actionResult.success({ blogId: result.id })
      : actionResult.failure('not_found', '文章不存在');
  } catch (error) {
    logger.error(
      safeErrorContext('updateBlogById', error, { userId: auth.data.id, resourceId: blogId })
    );
    return (
      classifyDataError(error) ?? actionResult.failure('temporary_failure', '暂时无法更新文章')
    );
  }
}

export async function getBlogList(
  pageNum: number,
  pageSize: number,
  searchParams: { content?: string; orderBy: 'desc' | 'asc' }
) {
  const content = searchParams.content?.trim() ?? '';
  const where: Prisma.BlogWhereInput = {
    delete: false,
    ...(content ? { content: { contains: content } } : {}),
  };
  try {
    const blogs = await db.blog.findMany({
      where,
      orderBy: [{ createdAt: searchParams.orderBy }, { id: searchParams.orderBy }],
      include: { author: { select: publicAuthorSelect }, tags: tagInclude },
      take: pageSize,
      skip: (pageNum - 1) * pageSize,
    });
    const total = await db.blog.count({ where });
    return actionResult.success({ blogs, pageBean: { pageNum, pageSize }, total });
  } catch (error) {
    logger.error(safeErrorContext('getBlogList', error));
    return actionResult.failure('temporary_failure', '暂时无法读取文章列表');
  }
}

export async function getAdjacentBlogs(id: unknown) {
  const blogId = parsePositiveInt(id);
  if (!blogId) return actionResult.failure('invalid_input', '文章 ID 无效');
  try {
    const current = await db.blog.findFirst({
      where: { id: blogId, delete: false },
      select: { id: true, createdAt: true },
    });
    if (!current) return actionResult.failure('not_found', '文章不存在');
    const select = { title: true, id: true, createdAt: true } as const;
    const prev = await db.blog.findFirst({
      where: {
        delete: false,
        OR: [
          { createdAt: { lt: current.createdAt } },
          { createdAt: current.createdAt, id: { lt: current.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select,
    });
    const next = await db.blog.findFirst({
      where: {
        delete: false,
        OR: [
          { createdAt: { gt: current.createdAt } },
          { createdAt: current.createdAt, id: { gt: current.id } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select,
    });
    return actionResult.success({ prev, next });
  } catch (error) {
    logger.error(safeErrorContext('getAdjacentBlogs', error, { resourceId: blogId }));
    return actionResult.failure('temporary_failure', '暂时无法读取相邻文章');
  }
}

async function setInteraction(
  kind: 'like' | 'favorite',
  blogId: number,
  userId: string,
  enabled: boolean
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const blog = await tx.blog.findFirst({
            where: { id: blogId, delete: false },
            select: { id: true },
          });
          if (!blog) return null;
          if (kind === 'like') {
            const key = { blogId_userId: { blogId, userId } };
            if (enabled)
              await tx.blogLike.upsert({ where: key, update: {}, create: { blogId, userId } });
            else await tx.blogLike.deleteMany({ where: { blogId, userId } });
            const count = await tx.blogLike.count({ where: { blogId } });
            await tx.blog.update({ where: { id: blogId }, data: { likeCount: count } });
            return { enabled, count };
          }
          const key = { blogId_userId: { blogId, userId } };
          if (enabled)
            await tx.blogFavorite.upsert({ where: key, update: {}, create: { blogId, userId } });
          else await tx.blogFavorite.deleteMany({ where: { blogId, userId } });
          const count = await tx.blogFavorite.count({ where: { blogId } });
          await tx.blog.update({ where: { id: blogId }, data: { favoriteCount: count } });
          return { enabled, count };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if ((isKnownPrismaError(error, 'P2034') || isKnownPrismaError(error, 'P2002')) && attempt < 2)
        continue;
      throw error;
    }
  }
  return undefined;
}

export async function likeBlog(id: unknown, like = true) {
  const auth = await resolveCurrentUser();
  if (auth.status !== 'success') return auth;
  const blogId = parsePositiveInt(id);
  if (!blogId || typeof like !== 'boolean')
    return actionResult.failure('invalid_input', '点赞状态无效');
  try {
    const result = await setInteraction('like', blogId, auth.data.id, like);
    return result ? actionResult.success(result) : actionResult.failure('not_found', '文章不存在');
  } catch (error) {
    logger.error(
      safeErrorContext('likeBlog', error, { userId: auth.data.id, resourceId: blogId ?? undefined })
    );
    return (
      classifyDataError(error) ?? actionResult.failure('temporary_failure', '暂时无法更新点赞状态')
    );
  }
}

export async function favoriteBlog(id: unknown, favorite: boolean) {
  const auth = await resolveCurrentUser();
  if (auth.status !== 'success') return auth;
  const blogId = parsePositiveInt(id);
  if (!blogId || typeof favorite !== 'boolean')
    return actionResult.failure('invalid_input', '收藏状态无效');
  try {
    const result = await setInteraction('favorite', blogId, auth.data.id, favorite);
    return result ? actionResult.success(result) : actionResult.failure('not_found', '文章不存在');
  } catch (error) {
    logger.error(
      safeErrorContext('favoriteBlog', error, {
        userId: auth.data.id,
        resourceId: blogId ?? undefined,
      })
    );
    return (
      classifyDataError(error) ?? actionResult.failure('temporary_failure', '暂时无法更新收藏状态')
    );
  }
}
