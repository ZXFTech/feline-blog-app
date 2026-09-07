"use client";

import { useEffect, useRef } from "react";
import { usePomodoroState } from "@/providers/PomodoroProvider";
import { formatMs } from "@/utils/timeUtils";

export default function PomodoroTitleBridge() {
  const { lifecycle, state } = usePomodoroState();
  const initialTitleRef = useRef<string | null>(null);
  const ownedTitleRef = useRef<string | null>(null);

  useEffect(() => {
    initialTitleRef.current = document.title;
    return () => {
      if (ownedTitleRef.current && document.title === ownedTitleRef.current)
        document.title = initialTitleRef.current ?? document.title;
    };
  }, []);

  useEffect(() => {
    if (lifecycle !== "ready") return;
    const prefix = state.phase === "focus" ? "🍅" : "☕";
    const title = `${prefix} ${formatMs(state.remainingMs)}`;
    ownedTitleRef.current = title;
    document.title = title;
  }, [lifecycle, state.phase, state.remainingMs]);

  return null;
}
