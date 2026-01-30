"use client";

import { useCallback, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import type { TomatoState } from "@/types/tomato";

interface DarkThemeProps {
  state: TomatoState;
  formattedTime: string;
  progress: number;
  onStart: (phase?: "focus" | "break") => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onEndEarly: (reason: string) => void;
}

export function DarkTheme({
  state,
  formattedTime,
  progress,
  onStart,
  onPause,
  onResume,
  onReset,
  onEndEarly,
}: DarkThemeProps) {
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { text-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
          50% { text-shadow: 0 0 40px rgba(59, 130, 246, 0.8); }
        }
        .timer-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>

      <div className="w-full max-w-md px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-2">
            Pomodoro
          </h1>
          <p className="text-slate-400 text-sm">
            {state.phase === "idle" && "Ready to focus?"}
            {state.phase === "focus" && "Focus Time"}
            {state.phase === "break" && "Break Time"}
          </p>
        </div>

        {/* Timer Display */}
        <div className="mb-8">
          <div className="bg-slate-800 bg-opacity-50 rounded-2xl p-12 text-center backdrop-blur-sm border border-slate-700 mb-6">
            <div className="timer-glow text-6xl font-bold text-blue-300 font-mono tracking-wider mb-6">
              {formattedTime}
            </div>

            {/* Circular Progress Indicator */}
            <div className="flex justify-center">
              <div className="relative w-40 h-40">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 100 100"
                >
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(71, 85, 105, 0.3)"
                    strokeWidth="8"
                  />

                  {/* Progress circle with gradient effect */}
                  <defs>
                    <linearGradient
                      id="progressGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="rgb(59, 130, 246)" />
                      <stop offset="100%" stopColor="rgb(168, 85, 247)" />
                    </linearGradient>
                  </defs>

                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="url(#progressGradient)"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 45}`}
                    strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
                    strokeLinecap="round"
                    style={{
                      transition: "stroke-dashoffset 0.2s linear",
                    }}
                  />
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold text-blue-300">
                    {Math.round(progress)}%
                  </div>
                  <div className="text-xs text-slate-400">complete</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-6 justify-center flex-wrap">
          {state.phase === "idle" ? (
            <>
              <button
                onClick={() => onStart("focus")}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-blue-500/50"
              >
                开始专注
              </button>
              <button
                onClick={() => onStart("break")}
                className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg font-semibold hover:border-slate-500 hover:text-white transition-all bg-slate-700 bg-opacity-50"
              >
                休息一下
              </button>
            </>
          ) : (
            <>
              <button
                onClick={state.isRunning ? onPause : onResume}
                className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-blue-500/50"
                aria-label={state.isRunning ? "Pause" : "Resume"}
              >
                {state.isRunning ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button
                onClick={onReset}
                className="p-4 border border-slate-600 text-slate-300 rounded-lg hover:border-slate-500 hover:text-white transition-all bg-slate-700 bg-opacity-50"
                aria-label="Reset"
              >
                <RotateCcw size={24} />
              </button>

              <button
                onClick={() => setShowEarlyStopModal(true)}
                className="p-4 border border-red-600 text-red-400 rounded-lg hover:border-red-500 hover:text-red-300 transition-all bg-red-900 bg-opacity-20"
                aria-label="Stop early"
              >
                <X size={24} />
              </button>
            </>
          )}
        </div>

        {/* Settings */}
        {state.phase === "idle" && (
          <div className="text-center text-sm text-slate-400">
            <p>
              Focus: {state.focusMinutes} min | Break: {state.breakMinutes} min
            </p>
          </div>
        )}

        {/* Early Stop Modal */}
        {showEarlyStopModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl">
              <h2 className="text-xl font-bold text-slate-100 mb-4">
                Stop Early?
              </h2>
              <textarea
                value={earlyStopReason}
                onChange={(e) => setEarlyStopReason(e.target.value)}
                placeholder="Why are you stopping early?"
                className="w-full p-3 border border-slate-600 rounded-lg mb-4 bg-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEarlyStopModal(false);
                    setEarlyStopReason("");
                  }}
                  className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:border-slate-500 hover:text-white transition-colors bg-slate-700 bg-opacity-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndEarly}
                  disabled={!earlyStopReason.trim()}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-700"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
