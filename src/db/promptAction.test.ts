import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hasRootRole: vi.fn(), createMany: vi.fn(), logError: vi.fn() }));

vi.mock('@/lib/auth/userAuth', () => ({ hasRootRole: mocks.hasRootRole }));
vi.mock('@/lib/logger/Logger', () => ({ default: { error: mocks.logError } }));
vi.mock('./client', () => ({ default: { prompt: { createMany: mocks.createMany } } }));

import { savePrompt } from './promptAction';

describe('savePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRootRole.mockResolvedValue({
      status: 'success',
      data: { id: 'root-1', role: 'ROOT' },
    });
  });

  it('AC-2 forwards authorization failures without touching the database', async () => {
    mocks.hasRootRole.mockResolvedValue({ status: 'forbidden', message: '没有权限' });

    await expect(savePrompt([], 'midjourney')).resolves.toEqual({
      status: 'forbidden',
      message: '没有权限',
    });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('AC-7 rejects invalid platforms and runtime item types', async () => {
    await expect(savePrompt([], 'other')).resolves.toMatchObject({ status: 'invalid_input' });
    await expect(savePrompt([null], 'midjourney')).resolves.toMatchObject({
      status: 'invalid_input',
    });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('AC-8 enforces the MariaDB TEXT UTF-8 byte limit', async () => {
    const atLimit = 'a'.repeat(65_535);
    mocks.createMany.mockResolvedValue({ count: 1 });

    await expect(
      savePrompt([{ id: 'one', content: atLimit, mark: '' }], 'midjourney')
    ).resolves.toEqual({ status: 'success', data: { count: 1 } });
    await expect(
      savePrompt([{ id: 'two', content: `${atLimit}a`, mark: '' }], 'midjourney')
    ).resolves.toMatchObject({ status: 'invalid_input' });
    await expect(
      savePrompt([{ id: 'three', content: '猫'.repeat(21_846), mark: '' }], 'midjourney')
    ).resolves.toMatchObject({ status: 'invalid_input' });
  });

  it('AC-16 writes only allowed prompt fields', async () => {
    mocks.createMany.mockResolvedValue({ count: 1 });

    await savePrompt(
      [{ id: ' source ', content: '  body  ', mark: ' mark ', imgUrl: 'private', role: 'ROOT' }],
      'midjourney'
    );

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{ originId: 'source', content: '  body  ', platform: 'midjourney', marks: 'mark' }],
    });
  });

  it('AC-14 logs safe metadata and returns a stable dependency failure', async () => {
    mocks.createMany.mockRejectedValue(new Error('content=secret token=secret'));

    await expect(
      savePrompt([{ id: 'one', content: 'body', mark: '' }], 'midjourney')
    ).resolves.toEqual({ status: 'temporary_failure', message: '暂时无法保存 Prompt' });
    expect(mocks.logError).toHaveBeenCalledWith({
      operation: 'savePrompt',
      category: 'unexpected',
      userId: 'root-1',
      errorClass: 'Error',
    });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain('content=secret');
  });
});
