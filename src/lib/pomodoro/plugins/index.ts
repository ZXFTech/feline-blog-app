import {
  playBreakSound,
  playEndSound,
  playPauseSound,
  playResumeSound,
  playStartSound,
} from "@/lib/audio/tomato";
import {
  PomodoroData,
  PomodoroPlugin,
  PomodoroSound,
  PomodoroSoundRule,
  PomodoroState,
} from "@/types/pomodoro";
import { PomodoroType } from "../../../../generated/prisma/enums";
import { durationMsFor } from "../reducer";
import { addTomatoHistory } from "@/db/tomatoActions";
import logger from "@/lib/logger/Logger";
import { phaseType } from "@/utils/timeUtils";

const SOUND: Record<PomodoroSound, (v: number) => void> = {
  end: playEndSound,
  pause: playPauseSound,
  resume: playResumeSound,
  start: playStartSound,
  break: playBreakSound,
};

const rules: PomodoroSoundRule[] = [
  {
    when: (prev, curr) => curr.run === "stopped" && prev.phase !== curr.phase,
    sound: "end",
  },

  { when: (_, curr) => curr.run === "paused", sound: "pause" },
  {
    when: (prev, curr) => curr.run === "running" && prev.run === "paused",
    sound: "resume",
  },
  {
    when: (prev, curr) =>
      curr.run === "running" &&
      prev.run === "stopped" &&
      curr.phase === "focus",
    sound: "start",
  },
  {
    when: (prev, curr) =>
      curr.run === "running" &&
      prev.run === "stopped" &&
      curr.phase !== "focus",
    sound: "break",
  },
  {
    when: (prev, curr) =>
      prev.run === "running" &&
      curr.run === "running" &&
      prev.phase !== curr.phase &&
      curr.phase === "focus",
    sound: "start",
  },
  {
    when: (prev, curr) =>
      prev.run === "running" &&
      curr.run === "running" &&
      prev.phase !== curr.phase &&
      (curr.phase === "long_break" || curr.phase === "short_break"),
    sound: "break",
  },
];

function AudioPlugin(): PomodoroPlugin<PomodoroState> {
  return {
    name: "sound",
    onStateChange: (prev, next) => {
      const volume = next.settings.volume ?? 0.5;

      const sound = rules.find((r) => r.when(prev, next))?.sound;
      if (!sound) {
        return;
      }
      SOUND[sound](volume);
    },
  };
}

function transformStateToData(state: PomodoroState): PomodoroData {
  const { phase, startAt, settings, remainingMs } = state;
  if (phase === "idle") {
    throw "invalid phase";
  }

  const startDate = new Date(startAt!);
  const duration = durationMsFor(phase, settings);
  const endDate = new Date(startAt! + duration - remainingMs);

  return {
    startAt: startDate,
    endAt: endDate,
    type: phaseType(phase) as PomodoroType,
    durationMs: duration,
    actualDurationMs: duration - remainingMs,
    finished: remainingMs === 0,
  };
}

function RecordPlugin(): PomodoroPlugin<PomodoroState> {
  return {
    name: "record",
    async onStateChange(prev, next) {
      if (prev.phase === "idle") {
        // IDLE
        return;
      }
      if (prev.phase === next.phase) {
        // 非切换状态不记录
        return;
      }
      const recordData: PomodoroData = transformStateToData(prev);

      try {
        await addTomatoHistory(recordData);
      } catch (error) {
        logger.error("记录失败.", error);
        return { error: true, message: error };
      }
    },
  };
}

export { AudioPlugin, RecordPlugin };
