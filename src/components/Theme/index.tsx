"use client";

import React, { useEffect, useState } from "react";
import NeuButton from "../NeuButton";
import { Candy, Moon, Sun, Sunset } from "lucide-react";
import {
  applyTheme,
  getSystemTheme,
  persistTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  ThemeName,
} from "@/lib/theme";

const DARK_THEME_QUERY = "(prefers-color-scheme: dark)";

const themeOptions: ReadonlyArray<{
  name: ThemeName;
  label: string;
  className: string;
  icon: typeof Sun;
}> = [
  {
    name: "light",
    label: "使用浅色主题",
    className: "bg-(--light-color-bg)! text-(--light-color-font)!",
    icon: Sun,
  },
  {
    name: "dark",
    label: "使用深色主题",
    className: "bg-(--dark-color-bg)! text-(--dark-color-font)!",
    icon: Moon,
  },
  {
    name: "sugar",
    label: "使用糖果主题",
    className: "bg-(--sugar-color-bg)! text-(--sugar-color-font)!",
    icon: Candy,
  },
  {
    name: "warm",
    label: "使用暖色主题",
    className: "bg-(--warm-color-bg)! text-(--warm-color-font)!",
    icon: Sunset,
  },
];

function Theme() {
  const [activeTheme, setActiveTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_THEME_QUERY);

    const syncTheme = () => {
      const theme = readStoredTheme(window.localStorage) ?? getSystemTheme(mediaQuery);
      applyTheme(theme);
      setActiveTheme(theme);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) syncTheme();
    };

    syncTheme();
    mediaQuery.addEventListener("change", syncTheme);
    window.addEventListener("storage", handleStorage);

    return () => {
      mediaQuery.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setTheme = (theme: ThemeName) => {
    const root = document.documentElement;

    root.classList.add("theme-transition");
    persistTheme(theme, window.localStorage);
    applyTheme(theme, root);
    setActiveTheme(theme);
    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 1500);
  };

  return (
    <div className="flex gap-1 items-center" aria-label="主题选择">
      {themeOptions.map(({ name, label, className, icon: ThemeIcon }) => (
        <NeuButton
          key={name}
          className={className}
          aria-label={label}
          aria-pressed={activeTheme === name}
          onClick={() => setTheme(name)}
        >
          <ThemeIcon aria-hidden="true" />
        </NeuButton>
      ))}
    </div>
  );
}

export default Theme;
