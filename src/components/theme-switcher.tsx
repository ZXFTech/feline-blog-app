"use client";

import { THEMES, useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  sugar: "Sugar",
  warm: "Warm",
};

const SWATCHES: Record<Theme, { bg: string; ring: string }> = {
  light: { bg: "#dbdbdb", ring: "#bababa" },
  dark: { bg: "#212121", ring: "#000000" },
  sugar: { bg: "#f0cfd0", ring: "#c47f82" },
  warm: { bg: "#fedfa8", ring: "#d8be90" },
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-2 rounded-full bg-background p-2 shadow-neu-inset-sm"
    >
      {THEMES.map((themeName) => {
        const active = theme === themeName;
        return (
          <button
            key={themeName}
            type="button"
            role="radio"
            aria-checked={active}
            title={LABELS[themeName]}
            onClick={() => setTheme(themeName)}
            className={cn(
              "flex size-7 cursor-pointer items-center justify-center rounded-full transition-shadow",
              active ? "shadow-neu-inset-sm" : "shadow-neu-raised-sm"
            )}
          >
            <span
              className="size-4 rounded-full ring-1"
              style={{
                backgroundColor: SWATCHES[themeName].bg,
                boxShadow: `inset 0 0 0 1px ${SWATCHES[themeName].ring}`,
              }}
            />
            <span className="sr-only">{LABELS[themeName]}</span>
          </button>
        );
      })}
    </div>
  );
}
