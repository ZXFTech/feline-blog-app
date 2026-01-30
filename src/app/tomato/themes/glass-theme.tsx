"use client";

import { useCallback, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import type { TomatoState } from "@/types/tomato";

interface GlassThemeProps {
  state: TomatoState;
  formattedTime: string;
  progress: number;
  onStart: (phase?: "focus" | "break") => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onEndEarly: (reason: string) => void;
}

export function GlassTheme({
  state,
  formattedTime,
  progress,
  onStart,
  onPause,
  onResume,
  onReset,
  onEndEarly,
}: GlassThemeProps) {
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
    <div
      className="flex items-center justify-center min-h-screen relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      {/* Animated background blobs */}
      <div
        className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{
          background: "rgba(255, 255, 255, 0.5)",
          top: "-50px",
          right: "-50px",
          animation: "float 6s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{
          background: "rgba(255, 255, 255, 0.5)",
          bottom: "-100px",
          left: "-50px",
          animation: "float 8s ease-in-out infinite reverse",
        }}
      />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(30px); }
        }
      `}</style>

      <div className="w-full max-w-md px-4 relative z-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Pomodoro</h1>
          <p className="text-white text-opacity-80 text-sm">
            {state.phase === "idle" && "Ready to focus?"}
            {state.phase === "focus" && "Focus Time"}
            {state.phase === "break" && "Break Time"}
          </p>
        </div>

        {/* Timer Display - Glassmorphic Container */}
        <div className="mb-8">
          <div
            className="rounded-3xl p-12 text-center backdrop-blur-xl border border-white border-opacity-20"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
            }}
          >
            <div className="text-6xl font-bold text-white mb-6 font-mono tracking-wider">
              {formattedTime}
            </div>

            {/* Animated Progress Circle */}
            <div className="flex justify-center mb-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.9)"
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
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white text-opacity-70 font-semibold">
                  {Math.round(progress)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3 mb-6 justify-center flex-wrap">
          {state.phase === "idle" ? (
            <>
              <button
                onClick={() => onStart("focus")}
                className="px-6 py-3 rounded-2xl font-semibold backdrop-blur-lg border border-white border-opacity-30 text-white hover:border-opacity-50 transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
                }}
              >
                Start Focus
              </button>
              <button
                onClick={() => onStart("break")}
                className="px-6 py-3 rounded-2xl font-semibold backdrop-blur-lg border border-white border-opacity-30 text-white hover:border-opacity-50 transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
                }}
              >
                Start Break
              </button>
            </>
          ) : (
            <>
              <button
                onClick={state.isRunning ? onPause : onResume}
                className="p-4 rounded-full backdrop-blur-lg border border-white border-opacity-30 text-white hover:border-opacity-50 transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
                }}
                aria-label={state.isRunning ? "Pause" : "Resume"}
              >
                {state.isRunning ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button
                onClick={onReset}
                className="p-4 rounded-full backdrop-blur-lg border border-white border-opacity-30 text-white hover:border-opacity-50 transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
                }}
                aria-label="Reset"
              >
                <RotateCcw size={24} />
              </button>

              <button
                onClick={() => setShowEarlyStopModal(true)}
                className="p-4 rounded-full backdrop-blur-lg border border-red-300 border-opacity-50 text-red-200 hover:border-opacity-70 transition-all"
                style={{
                  background: "rgba(220, 38, 38, 0.15)",
                  boxShadow: "0 8px 32px 0 rgba(220, 38, 38, 0.2)",
                }}
                aria-label="Stop early"
              >
                <X size={24} />
              </button>
            </>
          )}
        </div>

        {/* Settings */}
        {state.phase === "idle" && (
          <div className="text-center text-sm text-white text-opacity-70">
            <p>
              Focus: {state.focusMinutes} min | Break: {state.breakMinutes} min
            </p>
          </div>
        )}

        {/* Early Stop Modal */}
        {showEarlyStopModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div
              className="rounded-2xl p-6 max-w-sm w-full backdrop-blur-xl border border-white border-opacity-20"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
              }}
            >
              <h2 className="text-xl font-bold text-white mb-4">Stop Early?</h2>
              <textarea
                value={earlyStopReason}
                onChange={(e) => setEarlyStopReason(e.target.value)}
                placeholder="Why are you stopping early?"
                className="w-full p-3 rounded-lg mb-4 focus:outline-none resize-none border-0 bg-white bg-opacity-20 text-white placeholder-white placeholder-opacity-50 backdrop-blur-md"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEarlyStopModal(false);
                    setEarlyStopReason("");
                  }}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold backdrop-blur-lg border border-white border-opacity-30 text-white hover:border-opacity-50 transition-all"
                  style={{
                    background: "rgba(255, 255, 255, 0.15)",
                    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndEarly}
                  disabled={!earlyStopReason.trim()}
                  className="flex-1 px-4 py-2 rounded-lg font-semibold backdrop-blur-lg border border-opacity-30 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: earlyStopReason.trim()
                      ? "rgba(220, 38, 38, 0.5)"
                      : "rgba(107, 114, 128, 0.3)",
                    borderColor: earlyStopReason.trim()
                      ? "rgba(220, 38, 38, 0.5)"
                      : "rgba(255, 255, 255, 0.2)",
                  }}
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
