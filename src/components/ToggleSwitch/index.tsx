"use client";

import { useState } from "react";
import classNames, * as cn from "classnames";

interface ToggleSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}

export default function Switch({
  checked = false,
  onChange,
  disabled = false,
  size = "md",
  label,
}: ToggleSwitchProps) {
  const [isChecked, setIsChecked] = useState(checked);

  const handleToggle = () => {
    if (disabled) return;
    const newState = !isChecked;
    setIsChecked(newState);
    onChange?.(newState);
  };

  const sizeConfig = {
    sm: {
      container: "w-10 h-6",
      dot: "w-5 h-5",
      translate: "translate-x-4",
    },
    md: {
      container: "w-12 h-7",
      dot: "w-6 h-6",
      translate: "translate-x-5",
    },
    lg: {
      container: "w-14 h-8",
      dot: "w-7 h-7",
      translate: "translate-x-6",
    },
  };

  const config = sizeConfig[size];

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={disabled}
        aria-pressed={isChecked}
        style={{
          backgroundColor: isChecked
            ? "rgba(76, 255, 48, 0.8)"
            : "rgba(255, 52, 52, 0.5)",
        }}
        className={classNames(
          "relative inline-flex items-center rounded-full! transition-colors duration-300",
          config.container,
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <div
          className={classNames(
            "absolute top-0.5 left-0.5 rounded-full bg-white transition-transform duration-300 shadow-md",
            config.dot,
            isChecked && config.translate,
          )}
        />
      </button>
      {label && (
        <label
          className={classNames(
            "text-sm font-medium text-foreground cursor-pointer select-none m-0!",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          onClick={handleToggle}
        >
          {label}
        </label>
      )}
    </div>
  );
}
