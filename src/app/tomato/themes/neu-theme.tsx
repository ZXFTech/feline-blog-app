"use client";

import { useCallback, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import type { TomatoState } from "@/types/tomato";
import NeuDiv from "@/components/NeuDiv";
import NeuButton from "@/components/NeuButton";

interface NeumorphismThemeProps {
  state: TomatoState;
  formattedTime: string;
  progress: number;
  onStart: (phase?: "focus" | "break") => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onEndEarly: (reason: string) => void;
}

export function NeumorphismTheme({
  state,
  formattedTime,
  progress,
  onStart,
  onPause,
  onResume,
  onReset,
  onEndEarly,
}: NeumorphismThemeProps) {
  const [showEarlyStopModal, setShowEarlyStopModal] = useState(false);
  const [earlyStopReason, setEarlyStopReason] = useState("");

  const handleEndEarly = useCallback(() => {
    if (earlyStopReason.trim()) {
      onEndEarly(earlyStopReason);
      setShowEarlyStopModal(false);
      setEarlyStopReason("");
    }
  }, [earlyStopReason, onEndEarly]);

  return (
    <div className="flex items-center justify-center bg-bg">
      <div className="w-full max-w-md px-4">
        {/* Timer Display - Neumorphic Container */}
        <div className="mb-8">
          <NeuDiv className="rounded-3xl p-12 text-center">
            <div className="text-6xl font-bold mb-6 font-mono tracking-wider">
              {formattedTime}
            </div>

            {/* Circular Progress */}
            <svg className="w-32 h-32 mx-auto" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#d0d8e0"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#2d3436"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
                strokeLinecap="round"
                style={{
                  transform: "rotate(-90deg)",
                  transformOrigin: "50% 50%",
                  transition: "stroke-dashoffset 0.2s linear",
                }}
              />
            </svg>
          </NeuDiv>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-6 justify-center flex-wrap">
          {state.phase === "idle" ? (
            <>
              <NeuButton
                onClick={() => onStart("focus")}
                className="px-6 py-3 rounded-2xl font-semibold"
              >
                Start Focus
              </NeuButton>
              <NeuButton
                onClick={() => onStart("break")}
                className="px-6 py-3 rounded-2xl font-semibold"
              >
                Start Break
              </NeuButton>
            </>
          ) : (
            <>
              <NeuButton
                onClick={state.isRunning ? onPause : onResume}
                className="p-4 rounded-full"
                aria-label={state.isRunning ? "Pause" : "Resume"}
              >
                {state.isRunning ? <Pause size={24} /> : <Play size={24} />}
              </NeuButton>

              <NeuButton
                onClick={onReset}
                className="p-4 rounded-full "
                aria-label="Reset"
              >
                <RotateCcw size={24} />
              </NeuButton>

              <NeuButton
                onClick={() => setShowEarlyStopModal(true)}
                className="p-4 rounded-full text-danger-hover!"
                aria-label="Stop early"
              >
                <X size={24} />
              </NeuButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
