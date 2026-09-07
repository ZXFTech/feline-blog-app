import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PomodoroEndReason, PomodoroType } from "../../generated/prisma/enums";
import { Toaster } from "@/components/ProMessage";
import { usePomodoroActions } from "./PomodoroProvider";
import { PomodoroProvider } from "./PomodoroProvider";

vi.mock("@/providers/AuthProviders", () => ({
  useCtxAuth: () => ({ user: { id: "integration-user" } }),
}));

vi.mock("@/lib/audio/tomato", () => ({
  playBreakSound: vi.fn(),
  playEndSound: vi.fn(),
  playPauseSound: vi.fn(),
  playResumeSound: vi.fn(),
  playStartSound: vi.fn(),
}));

vi.mock("@/db/tomatoActions", () => ({
  savePomodoroRecord: vi.fn(async (payload) => ({
    status: "created",
    record: {
      id: "integration-record",
      eventId: payload.eventId,
      type: PomodoroType.FOCUS,
      endReason: PomodoroEndReason.COMPLETED,
      finished: true,
      startAt: payload.startAt,
      endAt: payload.endAt,
      durationMs: payload.targetDurationMs,
      actualDurationMs: payload.targetDurationMs,
      syncStatus: "synced",
    },
  })),
}));

function Controls() {
  const { setSettings, start } = usePomodoroActions();
  return (
    <button
      onClick={() => {
        setSettings({ focusMin: 0.001 });
        window.setTimeout(start, 0);
      }}
    >
      开始短计时
    </button>
  );
}

describe("PomodoroProvider integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the completion toast through the real timer and toaster chain", async () => {
    const user = userEvent.setup();
    render(
      <PomodoroProvider>
        <Controls />
        <Toaster />
      </PomodoroProvider>
    );

    await user.click(screen.getByRole("button", { name: "开始短计时" }));

    expect(
      await screen.findByText("本阶段已完成，记录将自动保存", {}, { timeout: 2_000 })
    ).toBeVisible();
  });
});
