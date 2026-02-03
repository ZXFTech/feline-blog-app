import {
  playBreakSound,
  playEndSound,
  playPauseSound,
  playResumeSound,
  playStartSound,
} from "@/lib/audio/tomato";
import {
  PluginContext,
  PomodoroPlugin,
  PomodoroSound,
  PomodoroSoundRule,
  PomodoroState,
} from "@/types/pomodoro";

const SOUND: Record<PomodoroSound, (v: number) => void> = {
  end: playEndSound,
  pause: playPauseSound,
  resume: playResumeSound,
  start: playStartSound,
  break: playBreakSound,
};

const rules: PomodoroSoundRule[] = [
  { when: (_, curr) => curr.run === "stopped", sound: "end" },
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

export { AudioPlugin };
