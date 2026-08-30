import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PomodoroEndReason, PomodoroType } from '../../../generated/prisma/enums';
import type { PomodoroHistoryRecord } from '@/types/pomodoro';
import PomodoroList from './PomodoroList';

const record: PomodoroHistoryRecord = {
  id: 'record-1',
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

describe('PomodoroList', () => {
  it('AC-9 explains an empty selected month', () => {
    render(<PomodoroList dataSource={[]} timeZone="UTC" />);

    expect(screen.getByText('这一天还没有番茄钟记录。')).toBeVisible();
  });

  it('AC-4 displays the outcome, duration and synchronization state', () => {
    render(<PomodoroList dataSource={[record]} timeZone="UTC" />);

    expect(screen.getByRole('list', { name: '番茄钟历史' })).toBeVisible();
    expect(screen.getByLabelText('已同步')).toHaveClass('text-success');
    expect(screen.queryByText('已同步')).not.toBeInTheDocument();
    expect(screen.getByText('目标 25:00')).toBeVisible();
    expect(screen.getByText('实际 25:00')).toBeVisible();
    expect(screen.getByText('完成')).toBeVisible();
    const historyCard = screen.getByLabelText('已同步').closest('.neu-div');
    expect(historyCard).toHaveClass('neu-div');
    expect(historyCard?.className).not.toMatch(/neu-interaction-raise|neu-embossed|neu-debossed/);
  });

  it('AC-7 keeps failed details in the display-only history', () => {
    render(
      <PomodoroList
        dataSource={[{ ...record, syncStatus: 'failed', lastError: '登录状态已失效' }]}
        timeZone="Asia/Shanghai"
      />
    );

    expect(screen.getByLabelText('同步暂停')).toHaveClass('text-warning');
    expect(screen.queryByText('同步暂停')).not.toBeInTheDocument();
    expect(screen.getByText('登录状态已失效')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
