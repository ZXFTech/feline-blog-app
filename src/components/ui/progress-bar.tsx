import type { CSSProperties } from "react";

import Tag from "@/components/Tag";
import { NeuSurface } from "@/components/ui/neu-surface";
import { cn } from "@/lib/utils";

type ProgressTone = "default" | "success" | "warning" | "danger" | "primary";

export interface ProgressBarProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  type?: ProgressTone;
  showLabel?: "percentage" | "num" | boolean;
  className?: string;
  title?: string;
  titleColor?: string | Exclude<ProgressTone, "default">;
  progressBarColor?: string;
}

const toneColor: Record<ProgressTone, string> = {
  default: "var(--primary)",
  success: "var(--status-success)",
  warning: "var(--status-warning)",
  danger: "var(--status-error)",
  primary: "var(--primary)",
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  type = "default",
  showLabel,
  title,
  titleColor,
  progressBarColor,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const height = { sm: "h-1.5", md: "h-2.5", lg: "h-4" }[size];
  const color =
    progressBarColor || (titleColor && toneColor[titleColor as ProgressTone]) || toneColor[type];
  const barStyle: CSSProperties = {
    width: `${percentage}%`,
    background: progressBarColor || toneColor[type],
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={className}
    >
      {title || showLabel ? (
        <div className="mb-1 flex items-center justify-between">
          {title ? (
            <Tag className="ml-0!" color={color}>
              {title}
            </Tag>
          ) : (
            <div />
          )}
          {showLabel ? (
            <div className="mb-1 text-right text-xs font-bold" style={{ color }}>
              {showLabel === "percentage" ? `${Math.round(percentage)}%` : value}
            </div>
          ) : null}
        </div>
      ) : null}
      <NeuSurface elevation="inset" radius="full" className="w-full overflow-hidden bg-muted">
        <div
          className={cn("rounded-full transition-all duration-300 ease-out", height)}
          style={barStyle}
        />
      </NeuSurface>
    </div>
  );
}
