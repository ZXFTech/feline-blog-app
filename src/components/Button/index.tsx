import React, { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

import classNames from "classnames";
import { IconSpinner } from "../Icon/presetIcon";
import Icon, { IconType } from "../Icon";

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
    buttonType,
    ...restProps
  } = props;

  // 配置 classnames
  const configClassNames = classNames(
    "btn",
    "inline-flex items-center justify-center",
    `${children ? "gap-1" : "gap-0"}`,
    {
      [`btn-${buttonType}`]: buttonType,
      [`btn-${btnSize}`]: btnSize,
      disabled: disabled,
      loading: loading,
    },
    className
  );

  return (
    <button
      disabled={disabled}
      ref={ref}
      className={configClassNames}
      {...restProps}
    >
      {loading && <IconSpinner size={btnSize} className="btn-loading" />}
      {icon && <Icon icon={icon} size={btnSize} className={`btn-icon`} />}
      <span className="text-center">{children}</span>
    </button>
  );
});
Button.displayName = "Button";

export default Button;
