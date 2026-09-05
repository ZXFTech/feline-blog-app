import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveCurrentUser: vi.fn(),
  hasBlogRoles: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  transaction: vi.fn(),
  likeUpsert: vi.fn(),
  likeDeleteMany: vi.fn(),
  likeCount: vi.fn(),
  favoriteUpsert: vi.fn(),
  favoriteDeleteMany: vi.fn(),
  favoriteCount: vi.fn(),
  blogUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/userAuth', () => ({
  resolveCurrentUser: mocks.resolveCurrentUser,
  hasBlogRoles: mocks.hasBlogRoles,
}));
vi.mock('@/lib/logger/Logger', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/server/error', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/error')>();
  return {
    ...original,
    isKnownPrismaError: (error: unknown, code?: string) => {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      return typeof errorCode === 'string' && (code === undefined || errorCode === code);
    },
  };
});
vi.mock('./client', () => ({
  default: {
    $transaction: mocks.transaction,
    blog: {
      findMany: mocks.findMany,
      count: mocks.count,
      findFirst: mocks.findFirst,
    },
    blogLike: { findUnique: vi.fn() },
    blogFavorite: { findUnique: vi.fn() },
  },
}));

import { favoriteBlog, getAdjacentBlogs, getBlogById, getBlogList, likeBlog } from './blogAction';

describe('public Blog data boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentUser.mockResolvedValue({
      status: 'unauthenticated',
      message: '请重新登录',
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        blog: { findFirst: mocks.findFirst, update: mocks.blogUpdate },
        blogLike: {
          upsert: mocks.likeUpsert,
          deleteMany: mocks.likeDeleteMany,
          count: mocks.likeCount,
        },
        blogFavorite: {
          upsert: mocks.favoriteUpsert,
          deleteMany: mocks.favoriteDeleteMany,
          count: mocks.favoriteCount,
        },
      })
    );
  });

  it('uses an explicit public author projection and matching list/count filters', async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);

    await expect(
      getBlogList(1, 20, {
        content: ' cat ',
        orderBy: 'desc',
      })
    ).resolves.toEqual({
      status: 'success',
      data: { blogs: [], pageBean: { pageNum: 1, pageSize: 20 }, total: 0 },
    });

    const expectedWhere = { delete: false, content: { contains: 'cat' } };
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        include: {
          author: { select: { id: true, username: true, avatar: true } },
          tags: { include: { tag: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    );
    expect(mocks.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('keeps public detail reads anonymous and excludes soft-deleted records', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 7,
      title: 'Cat',
      author: { id: 'user-1', username: 'cat', avatar: null },
      tags: [],
    });

    const result = await getBlogById(7);

    expect(result).toMatchObject({
      status: 'success',
      data: { isLiked: false, isFavorite: false },
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: 7, delete: false },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        tags: { include: { tag: true } },
      },
    });
  });

  it('AC-12 uses stable tuple ordering and excludes deleted adjacent articles', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    mocks.findFirst
      .mockResolvedValueOnce({ id: 7, createdAt })
      .mockResolvedValueOnce({ id: 6, title: 'prev', createdAt })
      .mockResolvedValueOnce({ id: 8, title: 'next', createdAt });

    await expect(getAdjacentBlogs(7)).resolves.toMatchObject({ status: 'success' });

    expect(mocks.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          delete: false,
          OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 7 } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    );
    expect(mocks.findFirst).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: {
          delete: false,
          OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: 7 } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    );
  });

  it('AC-10 sets the requested like state and persists an authoritative count', async () => {
    mocks.resolveCurrentUser.mockResolvedValue({
      status: 'success',
      data: { id: 'user-1', role: 'USER' },
    });
    mocks.findFirst.mockResolvedValue({ id: 7 });
    mocks.likeCount.mockResolvedValue(3);
    mocks.blogUpdate.mockResolvedValue({ id: 7 });

    await expect(likeBlog(7, true)).resolves.toEqual({
      status: 'success',
      data: { enabled: true, count: 3 },
    });

    expect(mocks.likeUpsert).toHaveBeenCalledWith({
      where: { blogId_userId: { blogId: 7, userId: 'user-1' } },
      update: {},
      create: { blogId: 7, userId: 'user-1' },
    });
    expect(mocks.likeCount).toHaveBeenCalledWith({ where: { blogId: 7 } });
    expect(mocks.blogUpdate).toHaveBeenCalledWith({ where: { id: 7 }, data: { likeCount: 3 } });
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' })
    );
  });

  it('AC-10 removes an absent favorite idempotently and never decrements a cached counter', async () => {
    mocks.resolveCurrentUser.mockResolvedValue({
      status: 'success',
      data: { id: 'user-1', role: 'USER' },
    });
    mocks.findFirst.mockResolvedValue({ id: 7 });
    mocks.favoriteDeleteMany.mockResolvedValue({ count: 0 });
    mocks.favoriteCount.mockResolvedValue(0);
    mocks.blogUpdate.mockResolvedValue({ id: 7 });

    await expect(favoriteBlog(7, false)).resolves.toEqual({
      status: 'success',
      data: { enabled: false, count: 0 },
    });
    expect(mocks.favoriteDeleteMany).toHaveBeenCalledWith({
      where: { blogId: 7, userId: 'user-1' },
    });
    expect(mocks.blogUpdate).toHaveBeenCalledWith({ where: { id: 7 }, data: { favoriteCount: 0 } });
  });

  it('AC-10 retries a concurrent duplicate relation and converges on the requested state', async () => {
    mocks.resolveCurrentUser.mockResolvedValue({
      status: 'success',
      data: { id: 'user-1', role: 'USER' },
    });
    mocks.transaction
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) =>
        callback({
          blog: { findFirst: mocks.findFirst, update: mocks.blogUpdate },
          blogLike: {
            upsert: mocks.likeUpsert,
            deleteMany: mocks.likeDeleteMany,
            count: mocks.likeCount,
          },
          blogFavorite: {
            upsert: mocks.favoriteUpsert,
            deleteMany: mocks.favoriteDeleteMany,
            count: mocks.favoriteCount,
          },
        })
      );
    mocks.findFirst.mockResolvedValue({ id: 7 });
    mocks.likeCount.mockResolvedValue(1);
    mocks.blogUpdate.mockResolvedValue({ id: 7 });

    await expect(likeBlog(7, true)).resolves.toEqual({
      status: 'success',
      data: { enabled: true, count: 1 },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});
