import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PomodoroEndReason, PomodoroType } from '../../../generated/prisma/enums';
import type { PomodoroHistoryRecord } from '@/types/pomodoro';
import { Pomodoro } from './index';

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  getTomatoHistory: vi.fn(),
  usePomodoro: vi.fn(),
}));

vi.mock('@/providers/AuthProviders', () => ({
  useCtxAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/db/tomatoActions', () => ({
  getTomatoHistory: mocks.getTomatoHistory,
}));

vi.mock('@/hooks/usePomodoro', () => ({
  usePomodoro: mocks.usePomodoro,
}));

vi.mock('./PomodoroTimer', () => ({
  default: () => <div>timer surface</div>,
}));

vi.mock('./PomodoroHistoryPanel', () => ({
  default: ({
    selectedDateKey,
    records,
    loading,
    error,
  }: {
    selectedDateKey: string;
    records: PomodoroHistoryRecord[];
    loading: boolean;
    error: string | null;
  }) => (
    <div aria-label="history surface">
      <span>{selectedDateKey}</span>
      <span>{loading ? 'loading' : 'settled'}</span>
      {error ? <span>{error}</span> : null}
      {records.map((record) => (
        <span key={record.id}>{record.id}</span>
      ))}
    </div>
  ),
}));

vi.mock('./PomodoroOperationPanel', () => ({
  default: ({
    onDateSelect,
    onVisibleMonthChange,
  }: {
    onDateSelect: (dateKey: string) => void;
    onVisibleMonthChange: (month: { year: number; monthIndex: number }) => void;
  }) => (
    <div aria-label="operation surface">
      <button onClick={() => onDateSelect('2026-07-15')}>选择七月日期</button>
      <button onClick={() => onVisibleMonthChange({ year: 2026, monthIndex: 6 })}>查看七月</button>
    </div>
  ),
}));

const augustRecord: PomodoroHistoryRecord = {
  id: 'august-record',
  eventId: 'august-event',
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  finished: true,
  startAt: '2026-08-30T00:00:00.000Z',
  endAt: '2026-08-30T00:25:00.000Z',
  durationMs: 1_500_000,
  actualDurationMs: 1_500_000,
  syncStatus: 'synced',
};

const controller = {
  state: {
    phase: 'idle' as const,
    run: 'stopped' as const,
    remainingMs: 1_500_000,
    startAt: null,
    endAt: null,
    activeEventId: null,
    pendingOutcome: null,
    completedFocus: 0,
    settings: {
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 4,
      autoStartNext: false,
      mute: false,
      volume: 0.5,
    },
  },
  outbox: [],
  storageError: null,
  recoveryNotice: null,
  isOnline: true,
  isSyncing: false,
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  skip: vi.fn(),
  stop: vi.fn(),
  setSettings: vi.fn(),
  retryNow: vi.fn(),
  adoptServerRecord: vi.fn(),
};

describe('Pomodoro workspace', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    mocks.user = { id: 'user-1' };
    mocks.getTomatoHistory.mockReset();
    mocks.getTomatoHistory.mockResolvedValue([]);
    mocks.usePomodoro.mockReset();
    mocks.usePomodoro.mockReturnValue(controller);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-9 renders only the login boundary for an anonymous visitor', () => {
    mocks.user = null;

    render(<Pomodoro />);

    expect(screen.getByRole('alert')).toHaveTextContent('请先登录');
    expect(screen.queryByLabelText('history surface')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('operation surface')).not.toBeInTheDocument();
    expect(mocks.getTomatoHistory).not.toHaveBeenCalled();
    expect(mocks.usePomodoro).not.toHaveBeenCalled();
  });

  it('AC-10 renders one workspace from the shared controller', async () => {
    render(<Pomodoro />);

    expect(await screen.findAllByText('timer surface')).toHaveLength(1);
    expect(screen.getAllByLabelText('history surface')).toHaveLength(1);
    expect(screen.getAllByLabelText('operation surface')).toHaveLength(1);
    expect(mocks.usePomodoro).toHaveBeenCalledWith({
      onRecordSettled: expect.any(Function),
    });
  });

  it('AC-7 keeps the selected month loading separate from the visible month', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mocks.getTomatoHistory.mockResolvedValue([augustRecord]);
    render(<Pomodoro />);
    expect(await screen.findByText('august-record')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '查看七月' }));

    expect(screen.getByText('2026-08-30')).toBeVisible();
    expect(screen.getByText('august-record')).toBeVisible();
  });

  it('AC-7 ignores a stale response after a newer request for the same month', async () => {
    let resolveFirst!: (records: PomodoroHistoryRecord[]) => void;
    const first = new Promise<PomodoroHistoryRecord[]>((resolve) => {
      resolveFirst = resolve;
    });
    mocks.getTomatoHistory.mockReturnValueOnce(first).mockResolvedValueOnce([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = render(<Pomodoro />);

    await user.click(screen.getByRole('button', { name: '查看七月' }));
    await user.click(screen.getByRole('button', { name: '选择七月日期' }));
    rerender(<Pomodoro />);
    resolveFirst([augustRecord]);

    expect(await screen.findByText('2026-07-15')).toBeVisible();
    expect(screen.queryByText('august-record')).not.toBeInTheDocument();
  });
});
