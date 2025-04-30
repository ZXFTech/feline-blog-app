import React, { FC, HTMLAttributes } from "react";
import classnames from "classnames";

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

export interface IconProps extends HTMLAttributes<HTMLElement> {
  theme?: ThemeProps;
  icon: IconType | string;
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
  const { className, theme, icon, ...restProps } = props;
  const classes = classnames("icon", "material-symbols-outlined", className);

  return (
    <span
      style={{ color: themeColor[theme || "primary"] }}
      className={classes}
      {...restProps}
    >
      {icon}
    </span>
  );
};

export default Icon;
