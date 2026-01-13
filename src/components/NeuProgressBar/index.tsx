import classNames from "classnames";
import React from "react";
import NeuDiv from "../NeuDiv";
import Tag from "../Tag";

type ComponentType = "default" | "success" | "warning" | "danger" | "primary";

interface ProgressProps {
  value: number; // 当前值
  max?: number; // 最大值，默认 100
  size?: "sm" | "md" | "lg";
  type?: ComponentType;
  showLabel?: "percentage" | "num" | boolean; // 是否显示百分比
  className?: string;
  title?: string;
  titleColor?: string | "success" | "warning" | "danger" | "primary";
  progressBarColor?: string;
}

type TypeColor = {
  [k in ComponentType]: string;
};
const titleTypeColor: TypeColor = {
  success: "#00b33c",
  warning: "#f5830a",
  danger: "#f05000",
  primary: "#0077b3",
  default: "",
};

function NeuProgressBar({
  value,
  max = 100,
  size = "md",
  type = "default",
  showLabel,
  title = "",
  titleColor = "",
  progressBarColor = "",
  className,
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const classnames = classNames("neu-progress-bar", className);

  const sizeMap = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={classnames}
    >
      {(title || showLabel) && (
        <div className="flex justify-between items-center mb-1">
          {title ? (
            <Tag
              className="ml-0!"
              color={titleColor || titleTypeColor[type as keyof TypeColor]}
            >
              {title}
            </Tag>
          ) : (
            <div />
          )}
          {showLabel && (
            <div
              className="mb-1 text-xs text-right font-bold"
              style={{
                color: titleColor || titleTypeColor[type as keyof TypeColor],
              }}
            >
              {showLabel === "percentage"
                ? `${Math.round(percentage)}%`
                : value}
            </div>
          )}
        </div>
      )}

      <NeuDiv
        neuType="debossed"
        intensity="sm"
        className="w-full rounded-full p-0! bg-gray-200 overflow-hidden"
      >
        <div
          className={classNames(
            "transition-all duration-300 ease-out rounded-full",
            sizeMap[size],
            progressBarColor ? "" : `neu-progress-bar-${type}`
          )}
          style={{
            width: `${percentage}%`,
            ...(progressBarColor && { background: progressBarColor }),
          }}
        />
      </NeuDiv>
    </div>
  );
}
export default NeuProgressBar;
