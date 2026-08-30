import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PomodoroEndReason, PomodoroType } from '../../../generated/prisma/enums';
import type { PomodoroHistoryRecord } from '@/types/pomodoro';
import PomodoroHistoryPanel from './PomodoroHistoryPanel';

const record: PomodoroHistoryRecord = {
  id: 'record-1',
  eventId: 'event-1',
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  finished: true,
  startAt: '2026-08-30T00:00:00.000Z',
  endAt: '2026-08-30T00:25:00.000Z',
  durationMs: 1_500_000,
  actualDurationMs: 1_500_000,
  syncStatus: 'synced',
};

const baseProps = {
  selectedDateKey: '2026-08-30',
  todayKey: '2026-08-30',
  timeZone: 'UTC',
  records: [record],
  loading: false,
  error: null,
  pendingCount: 2,
  failedCount: 1,
  conflictCount: 3,
  pausedReason: null,
};

describe('PomodoroHistoryPanel', () => {
  it('AC-7 announces the selected date and synchronization summary', () => {
    render(<PomodoroHistoryPanel {...baseProps} />);

    expect(screen.getByText('2026年8月30日')).toBeVisible();
    expect(screen.getByText('今天')).toBeVisible();
    expect(screen.getByText('2 条待同步')).toBeVisible();
    expect(screen.getByText('1 条失败')).toBeVisible();
    expect(screen.getByText('3 条冲突')).toBeVisible();
    expect(screen.getByRole('list', { name: '番茄钟历史' })).toBeVisible();
  });

  it('AC-7 keeps loading and records available at the same time', () => {
    render(<PomodoroHistoryPanel {...baseProps} loading />);

    expect(screen.getByText('正在读取这一天的历史记录…')).toBeVisible();
    expect(screen.getByRole('list', { name: '番茄钟历史' })).toBeVisible();
  });

  it('AC-7 exposes an error and the pause reason without hiding cached records', () => {
    render(<PomodoroHistoryPanel {...baseProps} error="读取失败" pausedReason="登录状态已失效" />);

    expect(screen.getByRole('alert')).toHaveTextContent('读取失败');
    expect(screen.getByText('登录状态已失效')).toBeVisible();
    expect(screen.getByRole('list', { name: '番茄钟历史' })).toBeVisible();
  });

  it('AC-7 preserves the date heading for an empty day', () => {
    render(<PomodoroHistoryPanel {...baseProps} records={[]} />);

    expect(screen.getByText('2026年8月30日')).toBeVisible();
    expect(screen.getByText('这一天还没有番茄钟记录。')).toBeVisible();
  });
});
