"use client";

import React from "react";
import NeuButton from "../NeuButton";
import { Candy, Moon, Sun, Sunset } from "lucide-react";

function Theme() {
  const setTheme = (theme: string) => {
    document.body.setAttribute("data-theme", theme);
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
      <NeuButton onClick={() => setTheme("sunshine")}>
        <Sunset />
      </NeuButton>
    </div>
  );
}

export default Theme;
