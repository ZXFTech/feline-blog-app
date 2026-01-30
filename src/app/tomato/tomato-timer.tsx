"use client";

import { useCallback, useState } from "react";
import type { TomatoTheme } from "@/types/tomato";
import { useTomato } from "@/hooks/useTomato";

import { NeumorphismTheme } from "./themes/neu-theme";
import { GlassTheme } from "./themes/glass-theme";
import { DarkTheme } from "./themes/dark-theme";
import dynamic from "next/dynamic";
import NeuButton from "@/components/NeuButton";
import NeuDiv from "@/components/NeuDiv";
import { Pause, Play, RotateCcw, X } from "lucide-react";

interface TomatoTimerProps {
  theme?: TomatoTheme;
  focusMinutes?: number;
  breakMinutes?: number;
  muted?: boolean;
  volume?: number;
  onSessionComplete?: (reflection: string) => void;
  onSessionEndedEarly?: (reason: string) => void;
}

const Modal = dynamic(() => import("@/components/Modal"), { ssr: false });

export function TomatoTimer({
  theme = "neumorphism",
  muted = false,
  volume = 0.7,
}: TomatoTimerProps) {
  const [completionReflection, setCompletionReflection] = useState("");
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const {
    state,
    progress,
    formattedTime,
    start,
    pause,
    resume,
    reset,
    endEarly,
    complete,
    more,
  } = useTomato({
    config: {
      theme,
      muted,
      volume,
    },
    onSessionComplete: async (session) => {
      setShowCompletionModal(true);
      console.warn("session", session);
      console.warn("startTime", new Date(session.startTime));
      console.warn("status", session.status);
      console.warn("endTime", new Date(session.endTime));
    },
    onSessionEndedEarly: async (session) => {},
    beforeSessionComplete: () => {
      setShowCompletionModal(true);
    },
  });

  // Watch for session completion
  const handleSessionEnd = useCallback(async () => {
    // This will be called when timer reaches 0
    if (
      !state.isRunning &&
      state.phase !== "idle" &&
      state.remainingSeconds === 0
    ) {
      setShowCompletionModal(true);
    }
  }, [state.isRunning, state.phase, state.remainingSeconds]);

  const handleCompleteSession = useCallback(() => {
    complete(completionReflection);
    setShowCompletionModal(false);
    setCompletionReflection("");
  }, [completionReflection, complete]);

  const handleEndEarlyClick = useCallback(
    async (reason: string) => {
      await endEarly(reason);
    },
    [endEarly],
  );

  return (
    <>
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
                  onClick={() => start("focus", 3 / 60)}
                  className="px-6 py-3 rounded-2xl font-semibold"
                >
                  开始专注
                </NeuButton>
                <NeuButton
                  onClick={() => start("break", 3 / 60)}
                  className="px-6 py-3 rounded-2xl font-semibold"
                >
                  休息一会
                </NeuButton>
              </>
            ) : (
              <>
                <NeuButton
                  icon="add"
                  onClick={() => {
                    more("focus", 1 / 20);
                    setShowCompletionModal(false);
                  }}
                >
                  5 分钟
                </NeuButton>
                <NeuButton
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
      <Modal
        visible={showCompletionModal}
        onClose={() => {
          setShowCompletionModal(false);
        }}
        onOk={() => {
          handleCompleteSession();
          setShowCompletionModal(false);
        }}
      >
        <NeuButton
          onClick={() => {
            more("break", 3 / 60);
            setShowCompletionModal(false);
          }}
        >
          多坚持一会儿
        </NeuButton>
      </Modal>
      <Modal
        visible={showCompletionModal}
        onClose={() => {
          setShowCompletionModal(false);
        }}
        onOk={() => {
          handleCompleteSession();
          setShowCompletionModal(false);
        }}
      >
        <NeuButton
          onClick={() => {
            more("break", 3 / 60);
            setShowCompletionModal(false);
          }}
        >
          多坚持一会儿
        </NeuButton>
      </Modal>
    </>
  );
}
