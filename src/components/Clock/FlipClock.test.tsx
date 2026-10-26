import { act, cleanup, render, renderHook } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlipClock from "./FlipClock";
import { useClock } from "@/hooks/useClock";

beforeEach(() => vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("homepage clock hydration", () => {
  it("shows Monday for a known Monday instead of shifting every weekday by one", () => {
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0));
    const clock = render(<FlipClock />);
    expect(clock.container.textContent).toContain("星期一");
  });
  it("renders the same server placeholder when the request and hydration cross a second or date boundary", () => {
    vi.setSystemTime(new Date("2026-10-18T23:59:59.900Z"));
    const server = renderToString(<FlipClock />);
    vi.setSystemTime(new Date("2026-10-19T00:00:01.100Z"));
    expect(renderToString(<FlipClock />)).toBe(server);
  });

  it("hydrates delayed server HTML without recovering from a text mismatch", async () => {
    vi.setSystemTime(new Date("2026-10-18T23:59:59.900Z"));
    const element = document.createElement("div");
    element.innerHTML = renderToString(<FlipClock />);
    document.body.append(element);
    vi.setSystemTime(new Date("2026-10-19T00:00:01.100Z"));
    const errors: unknown[] = [];
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(element, <FlipClock />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(errors).toHaveLength(0);
      expect(element.textContent).toContain("星期");
    } finally {
      await act(async () => root?.unmount());
      element.remove();
    }
  });

  it("updates the live time on the next second and releases the timer after a strict mount", () => {
    const start = new Date("2026-10-19T00:00:01.250Z");
    vi.setSystemTime(start);
    const hook = renderHook(() => useClock(), { wrapper: StrictMode });
    expect(hook.result.current.time?.getTime()).toBe(start.getTime());
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(hook.result.current.time?.getTime()).toBe(start.getTime() + 750);
    expect(vi.getTimerCount()).toBe(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
