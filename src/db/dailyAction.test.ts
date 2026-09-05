import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasRootRole: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('@/lib/auth/userAuth', () => ({ hasRootRole: mocks.hasRootRole }));
vi.mock('@/lib/logger/Logger', () => ({ default: { error: vi.fn() } }));
vi.mock('./client', () => ({
  default: {
    dailyStat: { findUnique: mocks.findUnique, findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

import { getDailyRangeStatus, getDailyStatus, updateDailyStatus } from './dailyAction';

describe('daily actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRootRole.mockResolvedValue({
      status: 'success',
      data: { id: 'root-1', role: 'ROOT' },
    });
    mocks.findUnique.mockResolvedValue(null);
  });

  it('AC-2 forwards ROOT authorization failures before data access', async () => {
    mocks.hasRootRole.mockResolvedValue({ status: 'forbidden', message: '没有权限' });

    await expect(getDailyStatus('2026-01-01')).resolves.toMatchObject({ status: 'forbidden' });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('AC-7 rejects rolled dates and reversed ranges', async () => {
    await expect(getDailyStatus('2026-02-30')).resolves.toMatchObject({ status: 'invalid_input' });
    await expect(getDailyRangeStatus('2026-02-02', '2026-02-01')).resolves.toMatchObject({
      status: 'invalid_input',
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('AC-7 validates nested workout numeric boundaries', async () => {
    const invalid = { date: '2026-01-01', workouts: [{ name: 'run', sets: [{ duration: -1 }] }] };

    await expect(updateDailyStatus(invalid)).resolves.toMatchObject({ status: 'invalid_input' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('AC-16 writes only allowed daily counters through the transaction', async () => {
    mocks.upsert.mockResolvedValue({ id: 4, date: new Date('2026-01-01T00:00:00Z') });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({ dailyStat: { upsert: mocks.upsert } })
    );

    await updateDailyStatus({
      date: '2026-01-01',
      typingCount: 10,
      stepCount: 20,
      id: 999,
      role: 'ROOT',
    });

    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { date: new Date('2026-01-01T00:00:00.000Z') },
      update: { typingCount: 10, stepCount: 20 },
      create: { date: new Date('2026-01-01T00:00:00.000Z'), typingCount: 10, stepCount: 20 },
    });
  });
});
