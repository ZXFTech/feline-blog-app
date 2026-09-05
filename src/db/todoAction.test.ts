import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasTodoRoles: vi.fn(),
  transaction: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  tagUpsert: vi.fn(),
}));
vi.mock('@/lib/auth/userAuth', () => ({ hasTodoRoles: mocks.hasTodoRoles }));
vi.mock('@/lib/logger/Logger', () => ({ default: { error: vi.fn() } }));
vi.mock('./client', () => ({
  default: {
    $transaction: mocks.transaction,
    todo: {
      findMany: mocks.findMany,
      count: mocks.count,
      updateMany: mocks.updateMany,
      findFirst: mocks.findFirst,
    },
  },
}));

import { addTodo, deleteTodo, getTodoById, getTodoList, updateTodo } from './todoAction';

describe('todo actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasTodoRoles.mockResolvedValue({
      status: 'success',
      data: { id: 'root-1', role: 'ROOT' },
    });
    mocks.transaction.mockImplementation(async (value: unknown) => {
      if (Array.isArray(value)) return [[], 4, 2];
      return (value as (tx: unknown) => unknown)({
        tag: { upsert: mocks.tagUpsert },
        todo: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update },
      });
    });
  });

  it('AC-2 forwards authorization failures before data access', async () => {
    mocks.hasTodoRoles.mockResolvedValue({ status: 'forbidden', message: '没有权限' });

    await expect(getTodoList()).resolves.toMatchObject({ status: 'forbidden' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('AC-3 AC-11 scopes lists and totals while keeping filter semantics distinct', async () => {
    await expect(
      getTodoList({ finished: false, content: ' cat ', orderBy: 'asc' })
    ).resolves.toEqual({ status: 'success', data: { todoList: [], total: 4, finished: 2 } });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'root-1', delete: false, finished: false, content: { contains: 'cat' } },
        orderBy: { createAt: 'asc' },
      })
    );
    expect(mocks.count).toHaveBeenNthCalledWith(1, { where: { userId: 'root-1', delete: false } });
    expect(mocks.count).toHaveBeenNthCalledWith(2, {
      where: { userId: 'root-1', delete: false, finished: true },
    });
  });

  it('AC-8 rejects Todo and tag values beyond their maximums', async () => {
    await expect(addTodo({ content: 'a'.repeat(501), tags: [] })).resolves.toMatchObject({
      status: 'invalid_input',
    });
    await expect(
      addTodo({ content: 'cat', tags: [{ content: 'a'.repeat(51), color: 'blue' }] })
    ).resolves.toMatchObject({ status: 'invalid_input' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('AC-9 writes tags and the Todo through one interactive transaction', async () => {
    mocks.tagUpsert.mockResolvedValue({ id: 8 });
    mocks.create.mockResolvedValue({ id: 3, content: 'cat' });

    await expect(
      addTodo({ content: ' cat ', tags: [{ content: ' pet ', color: ' blue ' }] })
    ).resolves.toEqual({ status: 'success', data: { result: { id: 3, content: 'cat' } } });
    expect(mocks.tagUpsert).toHaveBeenCalledWith({
      where: { userId_content: { userId: 'root-1', content: 'pet' } },
      update: { color: 'blue' },
      create: { content: 'pet', color: 'blue', userId: 'root-1' },
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'root-1', finished: false }),
      })
    );
  });

  it("AC-3 hides another user's Todo as not found during update", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(updateTodo({ id: 7, content: 'cat' })).resolves.toMatchObject({
      status: 'not_found',
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: 7, userId: 'root-1', delete: false },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('AC-3 AC-10 soft deletes by requested target state and owner', async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(deleteTodo(7)).resolves.toEqual({ status: 'success', data: { todoId: 7 } });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 7, userId: 'root-1' },
      data: { delete: true },
    });
  });

  it('AC-3 excludes deleted and foreign records from detail reads', async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(getTodoById(7)).resolves.toMatchObject({ status: 'not_found' });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, userId: 'root-1', delete: false } })
    );
  });
});
