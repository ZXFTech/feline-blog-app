import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@/lib/pomodoro/reducer";
import PomodoroTitleBridge from "./PomodoroTitleBridge";

const mocks = vi.hoisted(() => ({
  lifecycle: "ready" as "signed_out" | "hydrating" | "ready",
  state: null as unknown as typeof initialState,
}));

vi.mock("@/providers/PomodoroProvider", () => ({
  usePomodoroState: () => ({ lifecycle: mocks.lifecycle, state: mocks.state }),
}));

describe("PomodoroTitleBridge", () => {
  beforeEach(() => {
    document.title = "博客文章";
    mocks.lifecycle = "ready";
    mocks.state = initialState;
  });

  it("AC-8 updates the title only while the tomato bridge is mounted", () => {
    mocks.state = {
      ...initialState,
      phase: "focus",
      run: "running",
      remainingMs: 65_000,
    };

    const view = render(<PomodoroTitleBridge />);
    expect(document.title).toBe("🍅 01:05");

    view.unmount();
    expect(document.title).toBe("博客文章");
  });

  it("AC-2 leaves the current page title unchanged during hydration", () => {
    mocks.lifecycle = "hydrating";
    const view = render(<PomodoroTitleBridge />);
    expect(document.title).toBe("博客文章");

    view.unmount();
    expect(document.title).toBe("博客文章");
  });
});
