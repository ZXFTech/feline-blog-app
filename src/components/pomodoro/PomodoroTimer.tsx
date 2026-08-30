import { AlertTriangle } from 'lucide-react';
import FlipTimer from '@/components/Clock/FlipTimer';
import NeuButton from '@/components/NeuButton';
import NeuDiv from '@/components/NeuDiv';
import NeuInput from '@/components/NeuInput';
import type { PomodoroSettings, PomodoroState } from '@/types/pomodoro';
import { formatMs, phaseLabel } from '@/utils/timeUtils';

interface PomodoroTimerProps {
  state: PomodoroState;
  storageError: string | null;
  recoveryNotice: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
  onSettingsChange: (settings: Partial<PomodoroSettings>) => void;
}

export default function PomodoroTimer({
  state,
  storageError,
  recoveryNotice,
  onStart,
  onPause,
  onResume,
  onSkip,
  onStop,
  onSettingsChange,
}: PomodoroTimerProps) {
  const blocked = Boolean(storageError || state.pendingOutcome);
  return (
    <main
      className="my-auto flex shrink-0 flex-col items-center space-y-4"
      aria-labelledby="pomodoro-title"
    >
      <h1 id="pomodoro-title" className="sr-only">
        番茄钟
      </h1>
      {storageError ? (
        <NeuDiv className="flex items-center gap-2 p-4 text-danger" role="alert">
          <AlertTriangle aria-hidden="true" />
          {storageError}
        </NeuDiv>
      ) : null}
      {recoveryNotice ? (
        <NeuDiv className="p-4" role="status">
          {recoveryNotice}
        </NeuDiv>
      ) : null}
      <NeuDiv className="flex h-[30rem] w-[28rem] shrink-0 flex-col justify-center space-y-5 p-6">
        <div className="text-center">
          <p className="text-sm opacity-70">{phaseLabel(state)}</p>
          <div className="my-8" aria-label={`剩余时间 ${formatMs(state.remainingMs)}`}>
            <FlipTimer time={formatMs(state.remainingMs)} />
          </div>
          <p className="text-sm opacity-70">本轮已完成专注 {state.completedFocus} 次</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {state.run === 'running' ? (
            <NeuButton onClick={onPause}>暂停</NeuButton>
          ) : state.run === 'paused' ? (
            <NeuButton onClick={onResume}>继续</NeuButton>
          ) : (
            <NeuButton buttonType="primary" disabled={blocked} onClick={onStart}>
              开始专注
            </NeuButton>
          )}
          <NeuButton disabled={!state.activeEventId} onClick={onSkip}>
            跳过
          </NeuButton>
          <NeuButton buttonType="danger" disabled={!state.activeEventId} onClick={onStop}>
            停止
          </NeuButton>
        </div>
        <fieldset className="grid grid-cols-2 gap-3 text-sm" disabled={state.run !== 'stopped'}>
          <legend className="col-span-2 font-semibold">计时设置</legend>
          {(
            [
              ['focusMin', '专注分钟'],
              ['shortBreakMin', '短休分钟'],
              ['longBreakMin', '长休分钟'],
              ['longBreakEvery', '每几次长休'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="space-y-1">
              <span>{label}</span>
              <NeuInput
                className="w-full"
                min={1}
                max={1440}
                type="number"
                value={state.settings[key]}
                onChange={(event) => onSettingsChange({ [key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </fieldset>
      </NeuDiv>
    </main>
  );
}
