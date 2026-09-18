import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("persists and applies the selected theme class", async () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("radio", { name: "Sugar" }));
    expect(localStorage.getItem("donmiss-theme")).toBe("sugar");
    expect(document.documentElement).toHaveClass("sugar");
    expect(document.documentElement).not.toHaveClass("dark", "warm");
  });

  it("restores the persisted theme in both the document and switcher state", async () => {
    localStorage.setItem("donmiss-theme", "warm");
    document.documentElement.classList.add("warm");

    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );

    expect(await screen.findByRole("radio", { name: "Warm", checked: true })).toBeVisible();
    expect(document.documentElement).toHaveClass("warm");
  });

  it("uses the noli swatch radio group", () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toHaveClass("shadow-neu-inset-sm");
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Light", checked: true })).toHaveClass(
      "shadow-neu-inset-sm"
    );
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveClass("cursor-pointer");
  });

  it("enables the global color transition for 800ms after a theme change", () => {
    vi.useFakeTimers();
    try {
      render(
        <ThemeProvider>
          <ThemeSwitcher />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
      expect(document.documentElement).toHaveClass("dark", "theme-transitioning");

      vi.advanceTimersByTime(799);
      expect(document.documentElement).toHaveClass("theme-transitioning");

      vi.advanceTimersByTime(1);
      expect(document.documentElement).not.toHaveClass("theme-transitioning");
    } finally {
      vi.useRealTimers();
    }
  });

  it("covers: AC-4 restarts the 800ms window after a consecutive switch", () => {
    vi.useFakeTimers();
    try {
      render(
        <ThemeProvider>
          <ThemeSwitcher />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
      act(() => vi.advanceTimersByTime(500));
      fireEvent.click(screen.getByRole("radio", { name: "Warm" }));
      act(() => vi.advanceTimersByTime(799));
      expect(document.documentElement).toHaveClass("warm", "theme-transitioning");

      act(() => vi.advanceTimersByTime(1));
      expect(document.documentElement).not.toHaveClass("theme-transitioning");
    } finally {
      vi.useRealTimers();
    }
  });

  it("covers: AC-4 removes the transition marker when the provider unmounts", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <ThemeProvider>
          <ThemeSwitcher />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
      expect(document.documentElement).toHaveClass("theme-transitioning");

      unmount();
      expect(document.documentElement).not.toHaveClass("theme-transitioning");
    } finally {
      vi.useRealTimers();
    }
  });

  it("covers: AC-4 ignores invalid and legacy stored themes", async () => {
    localStorage.setItem("donmiss-theme", "unknown");
    localStorage.setItem("feline-blog-theme", "dark");
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );

    expect(await screen.findByRole("radio", { name: "Light", checked: true })).toBeVisible();
    expect(document.documentElement).not.toHaveClass("dark", "sugar", "warm");
  });

  it("covers: AC-4 rejects theme consumers outside the provider", () => {
    function ThemeConsumer() {
      useTheme();
      return null;
    }

    expect(() => render(<ThemeConsumer />)).toThrow("useTheme must be used within a ThemeProvider");
  });
});
