"use client";

import { usePomodoro } from "@/hooks/usePomodoro";
import { formatMs, phaseLabel } from "@/utils/timeUtils";
import NeuDiv from "../NeuDiv";
import FlipTimer from "../Clock/FlipTimer";
import NeuButton from "../NeuButton";
import NeuInput from "../NeuInput";
import { CheckSquare, Square } from "lucide-react";

export function Pomodoro() {
  const { state, start, pause, resume, stop, skip, setSettings } =
    usePomodoro();

  const time = formatMs(state.remainingMs);
  const label = phaseLabel(state);

  return (
    <NeuDiv className="max-w-md rounded-xl border p-4 space-y-4 mx-auto">
      <div className="space-y-1">
        <div className="text-sm opacity-70">{label}</div>
        <div className="my-8">
          <FlipTimer time={time} />
        </div>
        <div className="text-xs opacity-60 text-center">
          今日已完成专注: {state.completedFocus} 次
        </div>
      </div>

      <div className="flex justify-center gap-4">
        {state.run === "running" ? (
          <NeuButton onClick={pause}>暂停</NeuButton>
        ) : state.run === "paused" ? (
          <NeuButton onClick={resume}>继续</NeuButton>
        ) : (
          <NeuButton onClick={start}>开始</NeuButton>
        )}

        <NeuButton onClick={skip}>跳过</NeuButton>
        <NeuButton onClick={stop}>停止</NeuButton>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">
          <div className="opacity-70">专注(min)</div>
          <NeuInput
            className="w-full border rounded px-2 py-1"
            type="number"
            value={state.settings.focusMin}
            onChange={(e) => setSettings({ focusMin: Number(e.target.value) })}
          />
        </label>

        <label className="space-y-1">
          <div className="opacity-70">短休(min)</div>
          <NeuInput
            className="w-full border rounded px-2 py-1"
            type="number"
            value={state.settings.shortBreakMin}
            onChange={(e) =>
              setSettings({ shortBreakMin: Number(e.target.value) })
            }
          />
        </label>

        <label className="space-y-1">
          <div className="opacity-70">长休(min)</div>
          <NeuInput
            className="w-full border rounded px-2 py-1"
            type="number"
            value={state.settings.longBreakMin}
            onChange={(e) =>
              setSettings({ longBreakMin: Number(e.target.value) })
            }
          />
        </label>

        <label className="space-y-1">
          <div className="opacity-70">每几次长休</div>
          <NeuInput
            className="w-full border rounded px-2 py-1"
            type="number"
            value={state.settings.longBreakEvery}
            onChange={(e) =>
              setSettings({ longBreakEvery: Number(e.target.value) })
            }
          />
        </label>

        <div
          onClick={() =>
            setSettings({ autoStartNext: !state.settings.autoStartNext })
          }
          className="flex items-center select-none gap-1"
        >
          {state.settings.autoStartNext ? (
            <CheckSquare className="text-success" />
          ) : (
            <Square />
          )}
          <span>自动开始下一阶段</span>
        </div>
      </div>
    </NeuDiv>
  );
}
