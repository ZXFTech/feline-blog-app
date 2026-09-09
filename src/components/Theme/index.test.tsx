import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Theme from ".";
import { THEME_STORAGE_KEY } from "@/lib/theme";

interface MatchMediaController {
  mediaQuery: MediaQueryList;
  setMatches: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery)
  );

  return {
    mediaQuery,
    setMatches(nextMatches) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
  };
}

describe("Theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("theme-transition");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("follows system colour changes when the user has no saved preference", () => {
    const matchMedia = installMatchMedia(true);
    render(<Theme />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "使用深色主题" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    act(() => matchMedia.setMatches(false));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("persists an explicit theme and keeps it ahead of later system changes", async () => {
    const matchMedia = installMatchMedia(false);
    const user = userEvent.setup();
    const { unmount } = render(<Theme />);

    await user.click(screen.getByRole("button", { name: "使用糖果主题" }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("sugar");
    expect(document.documentElement).toHaveAttribute("data-theme", "sugar");

    act(() => matchMedia.setMatches(true));
    expect(document.documentElement).toHaveAttribute("data-theme", "sugar");

    unmount();
    document.documentElement.removeAttribute("data-theme");
    render(<Theme />);

    expect(document.documentElement).toHaveAttribute("data-theme", "sugar");
  });

  it("exposes an accessible named button and selected state for every theme", async () => {
    installMatchMedia(false);
    const user = userEvent.setup();
    render(<Theme />);

    for (const option of [
      { label: "使用浅色主题", theme: "light" },
      { label: "使用深色主题", theme: "dark" },
      { label: "使用糖果主题", theme: "sugar" },
      { label: "使用暖色主题", theme: "warm" },
    ]) {
      const button = screen.getByRole("button", { name: option.label });
      await user.click(button);

      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(document.documentElement).toHaveAttribute("data-theme", option.theme);
    }
  });

  it("synchronizes a theme selected in another browser tab", () => {
    installMatchMedia(false);
    render(<Theme />);
    window.localStorage.setItem(THEME_STORAGE_KEY, "warm");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "warm");
    expect(screen.getByRole("button", { name: "使用暖色主题" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
