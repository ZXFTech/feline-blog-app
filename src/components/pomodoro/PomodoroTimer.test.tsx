import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PomodoroState } from '@/types/pomodoro';
import PomodoroTimer from './PomodoroTimer';

const stoppedState: PomodoroState = {
  phase: 'idle',
  run: 'stopped',
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
};

const callbacks = {
  onStart: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onSkip: vi.fn(),
  onStop: vi.fn(),
  onSettingsChange: vi.fn(),
};

describe('PomodoroTimer', () => {
  it('AC-10 exposes the timer heading and starts a stopped timer', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <PomodoroTimer
        {...callbacks}
        state={stoppedState}
        storageError={null}
        recoveryNotice={null}
        onStart={onStart}
      />
    );

    expect(screen.getByRole('main', { name: '番茄钟' })).toBeVisible();
    expect(screen.getByLabelText('剩余时间 25:00')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '开始专注' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('AC-10 changes settings while stopped', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PomodoroTimer
        {...callbacks}
        state={stoppedState}
        storageError={null}
        recoveryNotice={null}
        onSettingsChange={onSettingsChange}
      />
    );

    const focusInput = screen.getByRole('spinbutton', { name: '专注分钟' });
    await user.type(focusInput, '3');

    expect(onSettingsChange).toHaveBeenCalledWith({ focusMin: 253 });
  });

  it('AC-10 exposes pause, skip and stop while running', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onSkip = vi.fn();
    const onStop = vi.fn();
    render(
      <PomodoroTimer
        {...callbacks}
        state={{
          ...stoppedState,
          phase: 'focus',
          run: 'running',
          activeEventId: 'event-1',
        }}
        storageError={null}
        recoveryNotice={null}
        onPause={onPause}
        onSkip={onSkip}
        onStop={onStop}
      />
    );

    await user.click(screen.getByRole('button', { name: '暂停' }));
    await user.click(screen.getByRole('button', { name: '跳过' }));
    await user.click(screen.getByRole('button', { name: '停止' }));

    expect(onPause).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: '计时设置' })).toBeDisabled();
  });

  it('AC-10 blocks starting and reports storage failures', () => {
    render(
      <PomodoroTimer
        {...callbacks}
        state={stoppedState}
        storageError="无法写入本地记录"
        recoveryNotice="已恢复上次计时"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('无法写入本地记录');
    expect(screen.getByRole('status')).toHaveTextContent('已恢复上次计时');
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('labels and allows an unstarted break to be skipped', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(
      <PomodoroTimer
        {...callbacks}
        state={{ ...stoppedState, phase: 'short_break', remainingMs: 300_000 }}
        storageError={null}
        recoveryNotice={null}
        onSkip={onSkip}
      />
    );

    expect(screen.getByRole('button', { name: '开始休息' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '跳过' }));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
