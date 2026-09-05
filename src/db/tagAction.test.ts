import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hasRootRole: vi.fn(), findMany: vi.fn() }));
vi.mock('@/lib/auth/userAuth', () => ({ hasRootRole: mocks.hasRootRole }));
vi.mock('@/lib/logger/Logger', () => ({ default: { error: vi.fn() } }));
vi.mock('./client', () => ({ default: { tag: { findMany: mocks.findMany } } }));

import { getAllTags, getOptionTagsById, getSortedTags } from './tagAction';

describe('tag actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRootRole.mockResolvedValue({
      status: 'success',
      data: { id: 'root-1', role: 'ROOT' },
    });
    mocks.findMany.mockResolvedValue([]);
  });

  it('AC-2 forwards authorization failures before data access', async () => {
    mocks.hasRootRole.mockResolvedValue({ status: 'unauthenticated', message: '请重新登录' });

    await expect(getAllTags()).resolves.toMatchObject({ status: 'unauthenticated' });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('AC-3 scopes private tag reads to the current user', async () => {
    await getAllTags();
    await getOptionTagsById('blog', 9);

    expect(mocks.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'root-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'root-1', blogs: { none: { blogId: 9 } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('AC-7 rejects invalid target, id, count and order enums before data access', async () => {
    await expect(getOptionTagsById('other' as 'blog', 1)).resolves.toMatchObject({
      status: 'invalid_input',
    });
    await expect(getOptionTagsById('todo', 0)).resolves.toMatchObject({ status: 'invalid_input' });
    await expect(getSortedTags('other', 'desc')).resolves.toMatchObject({
      status: 'invalid_input',
    });
    await expect(getSortedTags('blogs', 'sideways')).resolves.toMatchObject({
      status: 'invalid_input',
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('AC-11 filters zero counts and reports the maximum visible count', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 1, content: 'cat', _count: { blogs: 2 } },
      { id: 2, content: 'dog', _count: { blogs: 0 } },
      { id: 3, content: 'bird', _count: { blogs: 5 } },
    ]);

    await expect(getSortedTags('blogs', 'asc')).resolves.toMatchObject({
      status: 'success',
      data: {
        tags: [
          { id: 1, count: 2 },
          { id: 3, count: 5 },
        ],
        max: 5,
      },
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'root-1' },
        orderBy: { blogs: { _count: 'asc' } },
      })
    );
  });
});
