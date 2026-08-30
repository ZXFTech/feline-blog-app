import { describe, expect, it } from 'vitest';
import {
  dateKey,
  formatDateHeading,
  formatDateTitle,
  mergeMonthHistory,
  monthFromDateKey,
  recordsForDate,
  shiftMonth,
} from './calendar';
import type { PomodoroHistoryRecord, PomodoroOutboxItem } from '@/types/pomodoro';
import { PomodoroEndReason, PomodoroType } from '../../../generated/prisma/enums';

const serverRecord: PomodoroHistoryRecord = {
  id: 'server-record',
  eventId: '019d3b54-2e18-7000-8000-000000000001',
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  finished: true,
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-08-01T00:25:00.000Z',
  durationMs: 1_500_000,
  actualDurationMs: 1_500_000,
  syncStatus: 'synced',
};

describe('pomodoro calendar helpers', () => {
  it('AC-4 shifts months without carrying a month-end day', () => {
    expect(shiftMonth(monthFromDateKey('2026-01-31'), 1)).toEqual({
      year: 2026,
      monthIndex: 1,
    });
    expect(dateKey(2026, 1, 28)).toBe('2026-02-28');
  });

  it('AC-7 labels only yesterday, today and tomorrow', () => {
    expect(formatDateTitle('2026-08-29', '2026-08-30')).toContain('昨天');
    expect(formatDateTitle('2026-08-30', '2026-08-30')).toContain('今天');
    expect(formatDateTitle('2026-08-31', '2026-08-30')).toContain('明天');
    expect(formatDateTitle('2026-09-02', '2026-08-30')).toBe('2026年9月2日');
    expect(formatDateHeading('2026-08-30', '2026-08-30')).toEqual({
      full: '2026年8月30日',
      relative: '今天',
    });
  });

  it('AC-6 uses the server record as the canonical conflict date', () => {
    const conflict: PomodoroOutboxItem = {
      schemaVersion: 2,
      userId: 'user-1',
      eventId: serverRecord.eventId!,
      payload: {
        eventId: serverRecord.eventId!,
        type: PomodoroType.FOCUS,
        endReason: PomodoroEndReason.COMPLETED,
        startAt: '2026-08-02T00:00:00.000Z',
        endAt: '2026-08-02T00:25:00.000Z',
        targetDurationMs: 1_500_000,
        remainingMs: 0,
      },
      createdAt: '2026-08-02T00:25:00.000Z',
      retryCount: 0,
      nextAttemptAt: 0,
      lastError: 'conflict',
      status: 'conflict',
      serverRecord,
    };
    const merged = mergeMonthHistory(
      [serverRecord],
      [conflict],
      { year: 2026, monthIndex: 7 },
      'UTC'
    );

    expect(recordsForDate(merged, '2026-08-01', 'UTC')).toHaveLength(1);
    expect(recordsForDate(merged, '2026-08-02', 'UTC')).toHaveLength(0);
    expect(merged[0].syncStatus).toBe('conflict');
  });

  it('AC-6 assigns records to the local date of endAt', () => {
    const record = {
      ...serverRecord,
      startAt: '2026-08-01T15:30:00.000Z',
      endAt: '2026-08-01T16:00:00.000Z',
    };

    expect(recordsForDate([record], '2026-08-02', 'Asia/Shanghai')).toEqual([record]);
    expect(recordsForDate([record], '2026-08-01', 'Asia/Shanghai')).toEqual([]);
  });

  it('AC-6 merges a local pending item over the matching server event', () => {
    const pending: PomodoroOutboxItem = {
      schemaVersion: 2,
      userId: 'user-1',
      eventId: serverRecord.eventId!,
      payload: {
        eventId: serverRecord.eventId!,
        type: PomodoroType.SHORT,
        endReason: PomodoroEndReason.STOPPED,
        startAt: '2026-08-03T00:00:00.000Z',
        endAt: '2026-08-03T00:05:00.000Z',
        targetDurationMs: 300_000,
        remainingMs: 0,
      },
      createdAt: '2026-08-03T00:05:00.000Z',
      retryCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      status: 'pending',
    };

    const merged = mergeMonthHistory(
      [serverRecord],
      [pending],
      { year: 2026, monthIndex: 7 },
      'UTC'
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      eventId: pending.eventId,
      type: PomodoroType.SHORT,
      syncStatus: 'pending',
      endAt: pending.payload.endAt,
    });
  });

  it('AC-6 excludes local items outside the requested month and sorts newest first', () => {
    const newer = {
      ...serverRecord,
      id: 'newer',
      eventId: '019d3b54-2e18-7000-8000-000000000002',
      startAt: '2026-08-02T00:00:00.000Z',
      endAt: '2026-08-02T00:25:00.000Z',
    };
    const septemberItem: PomodoroOutboxItem = {
      schemaVersion: 2,
      userId: 'user-1',
      eventId: '019d3b54-2e18-7000-8000-000000000003',
      payload: {
        eventId: '019d3b54-2e18-7000-8000-000000000003',
        type: PomodoroType.FOCUS,
        endReason: PomodoroEndReason.COMPLETED,
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: '2026-09-01T00:25:00.000Z',
        targetDurationMs: 1_500_000,
        remainingMs: 0,
      },
      createdAt: '2026-09-01T00:25:00.000Z',
      retryCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      status: 'pending',
    };

    const merged = mergeMonthHistory(
      [serverRecord, newer],
      [septemberItem],
      { year: 2026, monthIndex: 7 },
      'UTC'
    );

    expect(merged.map((record) => record.id)).toEqual(['newer', 'server-record']);
  });
});
