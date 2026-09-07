"use client";

import { AlertTriangle, CirclePause, Timer } from "lucide-react";
import { usePathname } from "next/navigation";
import NeuButton from "@/components/NeuButton";
import { usePomodoroState } from "@/providers/PomodoroProvider";
import { formatMs, phaseLabel } from "@/utils/timeUtils";

export default function PomodoroGlobalStatus() {
  const pathname = usePathname();
  const { lifecycle, state, outbox, storageError } = usePomodoroState();

  if (lifecycle === "signed_out" || pathname === "/tomato") return null;

  const isActive = lifecycle === "ready" && state.run !== "stopped";
  const hasSyncError = outbox.some(
    (item) => item.status === "failed" || item.status === "conflict"
  );
  const hasError = Boolean(storageError || hasSyncError);
  const phaseIconClassName = state.phase === "focus" ? "text-danger!" : "text-success!";
  const statusText =
    lifecycle === "hydrating"
      ? "番茄钟状态恢复中"
      : state.run === "paused"
        ? `${phaseLabel(state)}已暂停，剩余 ${formatMs(state.remainingMs)}`
        : state.run === "running"
          ? `${phaseLabel(state)}，剩余 ${formatMs(state.remainingMs)}`
          : "打开番茄钟";

  return (
    <NeuButton
      btnSize="lg"
      buttonType="link"
      href="/tomato"
      aria-label={hasError ? `${statusText}，有需要处理的同步问题` : statusText}
      className="relative text-pomodoro! no-underline hover:bg-pomodoro/10! hover:no-underline mr-4"
    >
      {state.run === "paused" && lifecycle === "ready" ? (
        <CirclePause aria-hidden="true" className={phaseIconClassName} size="18" />
      ) : (
        <Timer aria-hidden="true" className={phaseIconClassName} size="18" />
      )}
      {isActive ? (
        <span className="hidden items-center gap-2 whitespace-nowrap xl:flex">
          <time
            className="font-mono text-lg"
            dateTime={`PT${Math.ceil(state.remainingMs / 1000)}S`}
          >
            {formatMs(state.remainingMs)}
          </time>
          {state.run === "paused" ? <span>已暂停</span> : null}
        </span>
      ) : null}
      {hasError ? (
        <span
          className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-danger text-white"
          title="番茄钟有需要处理的同步问题"
        >
          <AlertTriangle aria-hidden="true" size={14} />
          <span className="sr-only">有需要处理的同步问题</span>
        </span>
      ) : null}
    </NeuButton>
  );
}
