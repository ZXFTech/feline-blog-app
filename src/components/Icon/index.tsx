import { cn } from "@/lib/utils";
import React, { FC, HTMLAttributes } from "react";

export type ThemeProps =
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "light"
  | "dark";

export type IconType =
  | "Refresh"
  | "Progress Activity"
  | "check"
  | "file_copy"
  | string;

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

export const iconSizeMap = {
  xs: "8",
  sm: "12",
  md: "16",
  lg: "20",
  xl: "24",
  "2xl": "28",
  "3xl": "32",
};

export interface IconProps extends HTMLAttributes<HTMLElement> {
  theme?: ThemeProps;
  icon: IconType;
  size?: IconSize;
}

const themeColor = {
  primary: "#0d6efd",
  secondary: "#6c757d",
  danger: "#dc3545",
  error: "#fd7e14",
  warning: "#fadb14",
  success: "#52c41a",
  info: "#20c997",
  pink: "#d63384",
  light: "#f8f9fa",
  dark: "#343a40",
};

const Icon: FC<IconProps> = (props) => {
  // 如果theme是primary，添加类 icon-primary
  const { className, theme, icon, size = "md", ...restProps } = props;

  const classes = cn("neu-icon", "material-symbols-outlined", className);

  const style = theme ? { color: themeColor[theme] } : {};

  return (
    <span
      style={{ ...style, fontSize: iconSizeMap[size] + "px" }}
      className={`${classes}`}
      {...restProps}
    >
      {icon}
    </span>
  );
};

export default Icon;
