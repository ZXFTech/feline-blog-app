import React, {
  FC,
  ButtonHTMLAttributes,
  ReactNode,
  AnchorHTMLAttributes,
  forwardRef,
} from "react";

import classNames from "classnames";
import { IconSpinner } from "../Icon/presetIcon";
import Icon, { IconType } from "../Icon/icon";

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
type AnchorButtonProps = BaseButtonProps & AnchorHTMLAttributes<HTMLElement>;

export type ButtonProps = Partial<NativeButtonProps & AnchorButtonProps>;

const Button: FC<ButtonProps> = forwardRef<
  HTMLButtonElement & HTMLAnchorElement,
  ButtonProps
>((props, ref) => {
  const {
    className,
    disabled,
    btnSize = "md",
    href,
    children,
    loading,
    icon,
    buttonType,
    ...restProps
  } = props;

  // 配置 classnames
  const configClassNames = classNames(
    "btn",
    "flex items-center justify-start gap-1",
    {
      [`btn-${buttonType}`]: buttonType,
      [`btn-${btnSize}`]: btnSize,
      disabled: disabled,
      loading: loading,
    },
    className
  );

  if (buttonType === "link") {
    return (
      <a className={configClassNames} href={href} {...restProps}>
        {children}
      </a>
    );
  }

  return (
    <button ref={ref} className={configClassNames} {...restProps}>
      {loading && <IconSpinner size={btnSize} className="btn-loading" />}
      {icon && <Icon icon={icon} size={btnSize} className="btn-icon" />}
      <span className="break-all text-wrap text-left">{children}</span>
    </button>
  );
});
Button.displayName = "Button";

export default Button;
