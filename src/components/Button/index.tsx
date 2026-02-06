import React, { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

import { IconSpinner } from "../Icon/presetIcon";
import Icon, { IconType } from "../Icon";
import { cn } from "@/lib/utils";

export type ButtonSize = "sm" | "xs" | "md" | "lg" | "xl" | "2xl" | "3xl";

export type ButtonType =
  | "primary"
  | "default"
  | "danger"
  | "link"
  | "success"
  | "warn";

interface BaseButtonProps {
  className: string;
  disabled?: boolean;
  btnSize?: ButtonSize;
  buttonType?: ButtonType;
  href?: string;
  children?: ReactNode;
  loading?: boolean;
  icon?: IconType;
  suffixIcon?: IconType;
}

// 配置联合类型
type NativeButtonProps = BaseButtonProps & ButtonHTMLAttributes<HTMLElement>;

export type ButtonProps = Partial<NativeButtonProps>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const {
    className,
    disabled,
    btnSize = "md",
    children,
    loading,
    icon,
    suffixIcon,
    buttonType,
    ...restProps
  } = props;

  // 配置 classnames
  const configClassNames = cn(
    "btn",
    "inline-flex items-center justify-center relative",
    "outline-none whitespace-nowrap cursor-pointer",
    "text-font",
    `${children ? "gap-1" : "gap-0"}`,
    !children && "p-1!",
    {
      [`btn-${buttonType}`]: buttonType,
      [`btn-${btnSize}`]: btnSize,
      disabled: disabled,
      loading: loading,
    },
    className,
  );

  return (
    <button
      disabled={disabled}
      ref={ref}
      className={configClassNames}
      {...restProps}
    >
      {loading && <IconSpinner size={btnSize} className="btn-loading" />}
      {icon && <Icon icon={icon} size={btnSize} />}
      <span className="text-center">{children}</span>
      {suffixIcon && <Icon icon={suffixIcon} size={btnSize} />}
    </button>
  );
});
Button.displayName = "Button";

export default Button;
