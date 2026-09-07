import { render, renderHook, screen } from "@testing-library/react";
import { memo } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PomodoroEndReason, PomodoroType } from "../../generated/prisma/enums";
import { initialState } from "@/lib/pomodoro/reducer";
import type { DispatchMeta, PomodoroOutcome } from "@/types/pomodoro";
import {
  PomodoroProvider,
  usePomodoroActions,
  usePomodoroSettlement,
  usePomodoroState,
} from "./PomodoroProvider";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  options: null as null | {
    onOutcome: (outcome: PomodoroOutcome, source: DispatchMeta["source"]) => void;
  },
  success: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  skip: vi.fn(),
  setSettings: vi.fn(),
  retryNow: vi.fn(),
  adoptServerRecord: vi.fn(),
  state: null as unknown as typeof initialState,
}));

vi.mock("@/providers/AuthProviders", () => ({
  useCtxAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/components/ProMessage", () => ({
  toast: { success: mocks.success },
}));

vi.mock("@/hooks/usePomodoro", () => ({
  usePomodoro: (options: typeof mocks.options) => {
    mocks.options = options;
    return {
      lifecycle: mocks.user ? "ready" : "signed_out",
      state: mocks.state,
      outbox: [],
      storageError: null,
      recoveryNotice: null,
      isOnline: true,
      isSyncing: false,
      start: mocks.start,
      pause: mocks.pause,
      resume: mocks.resume,
      stop: mocks.stop,
      skip: mocks.skip,
      setSettings: mocks.setSettings,
      retryNow: mocks.retryNow,
      adoptServerRecord: mocks.adoptServerRecord,
    };
  },
}));

function Consumer() {
  const { lifecycle } = usePomodoroState();
  const { start } = usePomodoroActions();
  return <button onClick={start}>{lifecycle}</button>;
}

const ActionsOnlyConsumer = memo(function ActionsOnlyConsumer({
  onRender,
}: {
  onRender: () => void;
}) {
  onRender();
  usePomodoroActions();
  return null;
});

const completedOutcome: PomodoroOutcome = {
  eventId: "event-1",
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  startAt: "2026-09-06T00:00:00.000Z",
  endAt: "2026-09-06T00:25:00.000Z",
  targetDurationMs: 1_500_000,
  remainingMs: 0,
};

describe("PomodoroProvider", () => {
  beforeEach(() => {
    mocks.user = { id: "user-1" };
    mocks.options = null;
    mocks.success.mockReset();
    mocks.start.mockReset();
    mocks.state = initialState;
  });

  it("AC-1 exposes the global state and actions contexts", () => {
    render(
      <PomodoroProvider>
        <Consumer />
      </PomodoroProvider>
    );

    expect(screen.getByRole("button", { name: "ready" })).toBeVisible();
  });

  it("AC-8 shows one toast for a natural completion", () => {
    render(
      <PomodoroProvider>
        <Consumer />
      </PomodoroProvider>
    );

    mocks.options?.onOutcome(completedOutcome, "tick");
    mocks.options?.onOutcome(completedOutcome, "tick");
    mocks.options?.onOutcome({ ...completedOutcome, eventId: "event-2" }, "user");

    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith("本阶段已完成，记录将自动保存", {
      id: "pomodoro:user-1:event-1",
    });
  });

  it("AC-5 throws clear errors when all public hooks are used outside the provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => usePomodoroState())).toThrow(
      "usePomodoroState must be used within PomodoroProvider"
    );
    expect(() => renderHook(() => usePomodoroActions())).toThrow(
      "usePomodoroActions must be used within PomodoroProvider"
    );
    expect(() => renderHook(() => usePomodoroSettlement(vi.fn()))).toThrow(
      "usePomodoroSettlement must be used within PomodoroProvider"
    );

    consoleError.mockRestore();
  });

  it("AC-5 keeps the actions context stable when timer state changes", () => {
    const onRender = vi.fn();
    const view = render(
      <PomodoroProvider>
        <ActionsOnlyConsumer onRender={onRender} />
      </PomodoroProvider>
    );

    mocks.state = { ...initialState, remainingMs: initialState.remainingMs - 1_000 };
    view.rerender(
      <PomodoroProvider>
        <ActionsOnlyConsumer onRender={onRender} />
      </PomodoroProvider>
    );

    expect(onRender).toHaveBeenCalledTimes(1);
  });
});
