"use client";

import React from "react";
import NeuButton from "../NeuButton";
import { Candy, Moon, Sun, Sunset } from "lucide-react";

function Theme() {
  const setTheme = (theme: string) => {
    const root = document.body;

    root.classList.add("theme-transition");
    document.body.setAttribute("data-theme", theme);
    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 1500);
  };

  return (
    <div className="flex gap items-center">
      <NeuButton onClick={() => setTheme("")}>
        <Sun />
      </NeuButton>
      <NeuButton onClick={() => setTheme("dark")}>
        <Moon />
      </NeuButton>
      <NeuButton onClick={() => setTheme("sugar")}>
        <Candy />
      </NeuButton>
      <NeuButton onClick={() => setTheme("warm")}>
        <Sunset />
      </NeuButton>
    </div>
  );
}

export default Theme;
