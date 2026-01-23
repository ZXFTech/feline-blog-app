"use client";

import { Moon, Sun } from "lucide-react";
import NeuButton from "../NeuButton";
import { useEffect, useState } from "react";

type ToggleButtonProps = {
  isDark: boolean;
  onToggle: (isDark: boolean) => void;
};

export function ThemeToggle({}: ToggleButtonProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.body.setAttribute("data-theme", isDark ? "dark" : "");
  }, [isDark]);

  return (
    <NeuButton
      onClick={() => setIsDark((prev) => !prev)}
      className="relative px-4 py-2 rounded-full backdrop-blur-md bg-white/20 dark:bg-white/10 border border-white/30 dark:border-white/20 transition-all duration-300 hover:bg-white/30 dark:hover:bg-white/20 hover:shadow-lg"
      style={{ backgroundColor: isDark ? "black" : "white" }}
      aria-label="切换主题"
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-yellow-400" />
      ) : (
        <Moon className="w-5 h-5 text-blue-600" />
      )}
    </NeuButton>
  );
}
