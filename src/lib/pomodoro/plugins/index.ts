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
import { formatMs } from "@/utils/timeUtils";
import { isBrowser, nowMs } from "./utils";

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

function titlePlugin(): PomodoroPlugin<PomodoroState> {
  return {
    name: "title",
    onStateChange(_, next) {
      if (!isBrowser()) return;
      const timeRemaining = formatMs(next.remainingMs);
      const prefix = next.phase === "focus" ? "🍅" : "☕";
      document.title = `${prefix} ${timeRemaining}`;
    },
  };
}

function tickPlugin({
  intervalMs = 250,
  hiddenIntervalMs = 1000,
}: {
  intervalMs?: number;
  hiddenIntervalMs?: number;
}): PomodoroPlugin<PomodoroState> {
  const clear = (ctx: PluginContext<PomodoroState>) => {
    const runtime = ctx.runtime;
    const id = runtime.get("tick:interval") as number;
    if (id) {
      clearInterval(id);
      runtime.delete("tick:interval");
      runtime.delete("tick:intervalMs");
    }
  };

  const start = (ctx: PluginContext<PomodoroState>, ms: number) => {
    const runtime = ctx.runtime;
    const intervalId = runtime.get("tick:interval") as number;
    const intervalMs = runtime.get("tick:intervalMs") as number;
    if (intervalId && intervalMs) {
      return;
    }

    const id = setInterval(() => {
      ctx.dispatch({ type: "TICK", now: nowMs() });
    }, ms);

    runtime.set("tick:interval", id);
    runtime.set("tick:intervalMs", ms);
  };

  const sync = (ctx: PluginContext<PomodoroState>) => {
    const state = ctx.getState();
    if (state.run !== "running") {
      clear(ctx);
      return;
    }
    const ms =
      document.visibilityState === "visible" ? intervalMs : hiddenIntervalMs;
    start(ctx, ms);
  };

  return {
    name: "tick",
    setup(ctx) {
      if (!isBrowser()) {
        return;
      }
      const onVis = () => {
        sync(ctx);
      };

      document.addEventListener("visibilitychange", onVis);

      return () => {
        clear(ctx);
        document.removeEventListener("visibilitychange", onVis);
      };
    },
    onStateChange(prev, next, ctx) {
      if (prev === next) {
        return;
      }
      if (!isBrowser()) {
        return;
      }

      if (next.run !== "running") {
        clear(ctx);
        return;
      }

      const ms =
        document.visibilityState === "visible" ? intervalMs : hiddenIntervalMs;

      start(ctx, ms);
    },
  };
}

export { AudioPlugin, titlePlugin, tickPlugin };
