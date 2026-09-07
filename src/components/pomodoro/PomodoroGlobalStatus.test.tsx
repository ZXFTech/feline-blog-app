import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@/lib/pomodoro/reducer";
import type { PomodoroStateContextValue } from "@/providers/PomodoroProvider";
import PomodoroGlobalStatus from "./PomodoroGlobalStatus";

const mocks = vi.hoisted(() => ({
  pathname: "/blog",
  value: null as unknown as PomodoroStateContextValue,
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/providers/PomodoroProvider", () => ({
  usePomodoroState: () => mocks.value,
}));

describe("PomodoroGlobalStatus", () => {
  beforeEach(() => {
    mocks.pathname = "/blog";
    mocks.value = {
      lifecycle: "ready",
      state: initialState,
      outbox: [],
      storageError: null,
    };
  });

  it("AC-3 shows the running phase and remaining time on another page", () => {
    mocks.value = {
      ...mocks.value,
      state: { ...initialState, phase: "focus", run: "running", remainingMs: 65_000 },
    };

    render(<PomodoroGlobalStatus />);

    expect(screen.getByRole("link", { name: "专注，剩余 01:05" })).toHaveAttribute(
      "href",
      "/tomato"
    );
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("AC-4 does not duplicate the status on the tomato page", () => {
    mocks.pathname = "/tomato";
    render(<PomodoroGlobalStatus />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("AC-4 hides private timer state while signed out", () => {
    mocks.value = { ...mocks.value, lifecycle: "signed_out" };
    render(<PomodoroGlobalStatus />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("AC-2 exposes only a named timer link while hydration is pending", () => {
    mocks.value = { ...mocks.value, lifecycle: "hydrating" };
    render(<PomodoroGlobalStatus />);
    expect(screen.getByRole("link", { name: "番茄钟状态恢复中" })).toHaveAttribute(
      "href",
      "/tomato"
    );
    expect(screen.queryByRole("time")).not.toBeInTheDocument();
  });

  it("AC-3 announces the paused state and remaining time", () => {
    mocks.value = {
      ...mocks.value,
      state: { ...initialState, phase: "focus", run: "paused", remainingMs: 65_000 },
    };
    render(<PomodoroGlobalStatus />);
    expect(screen.getByRole("link", { name: "专注已暂停，剩余 01:05" })).toBeVisible();
    expect(screen.getByText("已暂停")).toBeVisible();
  });

  it("AC-9 announces storage problems and keeps the recovery link", () => {
    mocks.value = { ...mocks.value, storageError: "浏览器存储不可用" };
    render(<PomodoroGlobalStatus />);
    expect(
      screen.getByRole("link", {
        name: "打开番茄钟，有需要处理的同步问题",
      })
    ).toHaveAttribute("href", "/tomato");
    expect(screen.getByText("有需要处理的同步问题")).toBeInTheDocument();
  });
});
