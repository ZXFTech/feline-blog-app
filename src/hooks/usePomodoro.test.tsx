import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PomodoroEndReason, PomodoroType } from '../../generated/prisma/enums';
import type {
  PomodoroHistoryRecord,
  PomodoroOutboxItem,
  SavePomodoroResult,
} from '@/types/pomodoro';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  savePomodoroRecord: vi.fn(),
  probePomodoroStorage: vi.fn(),
  readTimer: vi.fn(),
  writeTimer: vi.fn(),
  readOutbox: vi.fn(),
  writeOutbox: vi.fn(),
  removeOutbox: vi.fn(),
  outbox: [] as PomodoroOutboxItem[],
  order: [] as string[],
}));

vi.mock('@/providers/AuthProviders', () => ({
  useCtxAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/db/tomatoActions', () => ({
  savePomodoroRecord: mocks.savePomodoroRecord,
}));

vi.mock('@/lib/pomodoro/plugins', () => ({
  AudioPlugin: () => ({ name: 'audio' }),
  titlePlugin: () => ({ name: 'title' }),
  tickPlugin: () => ({ name: 'tick' }),
}));

vi.mock('@/lib/pomodoro/storage', () => ({
  probePomodoroStorage: mocks.probePomodoroStorage,
  readTimer: mocks.readTimer,
  writeTimer: mocks.writeTimer,
  readOutbox: mocks.readOutbox,
  writeOutbox: mocks.writeOutbox,
  removeOutbox: mocks.removeOutbox,
  retryDelayMs: () => 1_000,
  timerKey: (userId: string) => `timer:${userId}`,
}));

import { usePomodoro } from './usePomodoro';

const eventId = '019d3b54-2e18-7000-8000-000000000001';

function outboxItem(overrides: Partial<PomodoroOutboxItem> = {}): PomodoroOutboxItem {
  return {
    schemaVersion: 2,
    userId: 'user-a',
    eventId,
    payload: {
      eventId,
      type: PomodoroType.FOCUS,
      endReason: PomodoroEndReason.COMPLETED,
      startAt: '2026-08-30T00:00:00.000Z',
      endAt: '2026-08-30T00:25:00.000Z',
      targetDurationMs: 1_500_000,
      remainingMs: 0,
    },
    createdAt: '2026-08-30T00:25:00.000Z',
    retryCount: 0,
    nextAttemptAt: 0,
    lastError: null,
    status: 'pending',
    ...overrides,
  };
}

const serverRecord: PomodoroHistoryRecord = {
  id: 'server-record',
  eventId,
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  finished: true,
  startAt: '2026-08-30T00:00:00.000Z',
  endAt: '2026-08-30T00:25:00.000Z',
  durationMs: 1_500_000,
  actualDurationMs: 1_500_000,
  syncStatus: 'synced',
};

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('usePomodoro synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: 'user-a' };
    mocks.outbox = [outboxItem()];
    mocks.order = [];
    mocks.readTimer.mockReturnValue({ state: null, recovered: false });
    mocks.readOutbox.mockImplementation((userId: string) =>
      mocks.outbox.filter((item) => item.userId === userId)
    );
    mocks.writeOutbox.mockImplementation((item: PomodoroOutboxItem) => {
      const index = mocks.outbox.findIndex((existing) => existing.eventId === item.eventId);
      if (index === -1) mocks.outbox.push(item);
      else mocks.outbox[index] = item;
    });
    mocks.removeOutbox.mockImplementation((userId: string, id: string) => {
      mocks.order.push('removed');
      mocks.outbox = mocks.outbox.filter((item) => item.userId !== userId || item.eventId !== id);
    });
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it.each(['created', 'already_exists'] as const)(
    'AC-6 publishes %s settlement before removing the outbox item',
    async (status) => {
      const onRecordSettled = vi.fn(() => mocks.order.push('settled'));
      mocks.savePomodoroRecord.mockResolvedValue({ status, record: serverRecord });

      const { result } = renderHook(() => usePomodoro({ plugins: [], onRecordSettled }));

      await waitFor(() => expect(onRecordSettled).toHaveBeenCalledOnce());
      expect(onRecordSettled).toHaveBeenCalledWith({
        item: expect.objectContaining({ eventId }),
        record: serverRecord,
        status,
      });
      expect(mocks.order).toEqual(['settled', 'removed']);
      await waitFor(() => expect(result.current.outbox).toEqual([]));
    }
  );

  it('AC-11 publishes a conflict and keeps its server record in the outbox', async () => {
    const onRecordSettled = vi.fn();
    mocks.savePomodoroRecord.mockResolvedValue({
      status: 'conflict',
      record: serverRecord,
      message: '服务端记录不同',
    });

    const { result } = renderHook(() => usePomodoro({ plugins: [], onRecordSettled }));

    await waitFor(() =>
      expect(result.current.outbox[0]).toMatchObject({
        status: 'conflict',
        lastError: '服务端记录不同',
        serverRecord,
      })
    );
    expect(onRecordSettled).toHaveBeenCalledWith({
      item: expect.objectContaining({ eventId }),
      record: serverRecord,
      status: 'conflict',
    });
    expect(mocks.removeOutbox).not.toHaveBeenCalled();
  });

  it('AC-11 does not synchronize while the browser is offline', async () => {
    setOnline(false);

    const { result } = renderHook(() => usePomodoro({ plugins: [] }));
    await act(async () => {
      await result.current.retryNow();
    });

    expect(result.current.isOnline).toBe(false);
    expect(mocks.savePomodoroRecord).not.toHaveBeenCalled();
    expect(result.current.outbox).toEqual([outboxItem()]);
  });

  it('AC-11 exposes synchronization state while a request is pending', async () => {
    let resolveSave!: (result: SavePomodoroResult) => void;
    mocks.savePomodoroRecord.mockReturnValue(
      new Promise<SavePomodoroResult>((resolve) => {
        resolveSave = resolve;
      })
    );

    const { result } = renderHook(() => usePomodoro({ plugins: [] }));
    await waitFor(() => expect(result.current.isSyncing).toBe(true));

    resolveSave({ status: 'created', record: serverRecord });

    await waitFor(() => expect(result.current.isSyncing).toBe(false));
  });

  it('AC-11 ignores concurrent retries while synchronization is running', async () => {
    let resolveSave!: (result: SavePomodoroResult) => void;
    mocks.savePomodoroRecord.mockReturnValue(
      new Promise<SavePomodoroResult>((resolve) => {
        resolveSave = resolve;
      })
    );
    const { result } = renderHook(() => usePomodoro({ plugins: [] }));
    await waitFor(() => expect(result.current.isSyncing).toBe(true));

    await act(async () => {
      await Promise.all([result.current.retryNow(), result.current.retryNow()]);
    });

    expect(mocks.savePomodoroRecord).toHaveBeenCalledOnce();
    resolveSave({ status: 'created', record: serverRecord });
    await waitFor(() => expect(result.current.isSyncing).toBe(false));
  });
});
