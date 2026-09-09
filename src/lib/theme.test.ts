import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getSystemTheme,
  isThemeName,
  persistTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  themeInitializationScript,
} from "./theme";

describe("theme persistence", () => {
  it("accepts only supported stored theme names", () => {
    expect(isThemeName("light")).toBe(true);
    expect(isThemeName("dark")).toBe(true);
    expect(isThemeName("sugar")).toBe(true);
    expect(isThemeName("warm")).toBe(true);
    expect(isThemeName("unknown")).toBe(false);
    expect(isThemeName(null)).toBe(false);
  });

  it("ignores invalid or unavailable persisted values", () => {
    expect(readStoredTheme({ getItem: () => "unknown" })).toBeNull();
    expect(
      readStoredTheme({
        getItem: () => {
          throw new DOMException("storage unavailable");
        },
      })
    ).toBeNull();
  });

  it("uses the system colour preference when no valid selection exists", () => {
    expect(getSystemTheme({ matches: true } as MediaQueryList)).toBe("dark");
    expect(getSystemTheme({ matches: false } as MediaQueryList)).toBe("light");
  });

  it("applies and persists a supported user selection", () => {
    const root = document.createElement("html");
    const setItem = vi.fn();

    applyTheme("sugar", root);
    persistTheme("sugar", { setItem });

    expect(root).toHaveAttribute("data-theme", "sugar");
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "sugar");
  });

  it("keeps the selected theme applied when persistence is unavailable", () => {
    const root = document.createElement("html");

    expect(() =>
      persistTheme("warm", {
        setItem: () => {
          throw new DOMException("storage unavailable");
        },
      })
    ).not.toThrow();
    applyTheme("warm", root);

    expect(root).toHaveAttribute("data-theme", "warm");
  });

  it("initializes the first paint from a saved theme before the system preference", () => {
    const documentElement = { dataset: {} as Record<string, string> };

    runInNewContext(themeInitializationScript, {
      document: { documentElement },
      localStorage: { getItem: () => "sugar" },
      window: { matchMedia: () => ({ matches: true }) },
    });

    expect(documentElement.dataset.theme).toBe("sugar");
  });

  it("initializes the first paint from the system when storage is invalid", () => {
    const documentElement = { dataset: {} as Record<string, string> };

    runInNewContext(themeInitializationScript, {
      document: { documentElement },
      localStorage: { getItem: () => "unknown" },
      window: { matchMedia: () => ({ matches: true }) },
    });

    expect(documentElement.dataset.theme).toBe("dark");
  });
});
