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
      <NeuButton
        className="bg-(--light-color-bg)! text-(--light-color-font)!"
        onClick={() => setTheme("")}
      >
        <Sun />
      </NeuButton>
      <NeuButton
        className="bg-(--dark-color-bg)! text-(--dark-color-font)!"
        onClick={() => setTheme("dark")}
      >
        <Moon />
      </NeuButton>
      <NeuButton
        className="bg-(--sugar-color-bg)! text-(--sugar-color-font)!"
        onClick={() => setTheme("sugar")}
      >
        <Candy />
      </NeuButton>
      <NeuButton
        className="bg-(--warm-color-bg)! text-(--warm-color-font)!"
        onClick={() => setTheme("warm")}
      >
        <Sunset />
      </NeuButton>
    </div>
  );
}

export default Theme;
