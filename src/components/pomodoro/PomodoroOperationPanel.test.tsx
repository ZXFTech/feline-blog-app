import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PomodoroEndReason, PomodoroType } from '../../../generated/prisma/enums';
import type { PomodoroOutboxItem } from '@/types/pomodoro';
import PomodoroOperationPanel from './PomodoroOperationPanel';

const conflict: PomodoroOutboxItem = {
  schemaVersion: 2,
  userId: 'user-1',
  eventId: 'event-1',
  payload: {
    eventId: 'event-1',
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
  lastError: 'conflict',
  status: 'conflict',
  serverRecord: {
    id: 'server-1',
    eventId: 'event-1',
    type: PomodoroType.SHORT,
    endReason: PomodoroEndReason.COMPLETED,
    finished: true,
    startAt: '2026-08-30T01:00:00.000Z',
    endAt: '2026-08-30T01:05:00.000Z',
    durationMs: 300_000,
    actualDurationMs: 300_000,
    syncStatus: 'synced',
  },
};

const baseProps = {
  selectedDateKey: '2026-08-30',
  todayKey: '2026-08-30',
  visibleMonth: { year: 2026, monthIndex: 7 },
  recordDates: [],
  conflicts: [],
  pendingCount: 1,
  isOnline: true,
  isSyncing: false,
  timeZone: 'UTC',
  onDateSelect: vi.fn(),
  onVisibleMonthChange: vi.fn(),
  onRetry: vi.fn(),
  onAdoptServer: vi.fn(),
};

describe('PomodoroOperationPanel', () => {
  it('AC-11 runs immediate synchronization when retry is available', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<PomodoroOperationPanel {...baseProps} onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: '立即同步' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each([
    [{ pendingCount: 0 }, '没有待同步记录'],
    [{ isOnline: false }, '离线时不能同步'],
    [{ isSyncing: true }, '正在同步'],
  ])('AC-11 disables retry and explains why', (override, reason) => {
    render(<PomodoroOperationPanel {...baseProps} {...override} />);

    expect(screen.getByRole('button', { name: '立即同步' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeVisible();
  });

  it('AC-11 shows conflict values and adopts the server record', async () => {
    const user = userEvent.setup();
    const onAdoptServer = vi.fn();
    render(
      <PomodoroOperationPanel {...baseProps} conflicts={[conflict]} onAdoptServer={onAdoptServer} />
    );

    expect(screen.getByText(/本地/)).toHaveTextContent('FOCUS');
    expect(screen.getByText(/本地/)).toHaveTextContent('SHORT');
    await user.click(screen.getByRole('button', { name: '采用服务端记录' }));

    expect(onAdoptServer).toHaveBeenCalledWith('event-1');
  });

  it('AC-11 disables adoption when the server record is unavailable', () => {
    render(
      <PomodoroOperationPanel
        {...baseProps}
        conflicts={[{ ...conflict, serverRecord: undefined }]}
      />
    );

    expect(screen.getByText(/服务端记录暂不可用/)).toBeVisible();
    expect(screen.getByRole('button', { name: '采用服务端记录' })).toBeDisabled();
  });
});
