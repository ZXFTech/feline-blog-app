import React, {
  FC,
  ButtonHTMLAttributes,
  ReactNode,
  AnchorHTMLAttributes,
} from "react";

import classNames from "classnames";
import { IconSpinner } from "../Icon/presetIcon";
import Icon, { IconType } from "../Icon/icon";

export type ButtonSize = "lg" | "sm" | "xs";

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
  size?: ButtonSize;
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

const Button: FC<ButtonProps> = (props) => {
  const {
    className,
    disabled,
    size = "md",
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
    {
      [`btn-${buttonType}`]: buttonType,
      [`btn-${size}`]: size,
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
    <button className={configClassNames} {...restProps}>
      {loading && <IconSpinner size={size} className="btn-loading" />}
      {icon && <Icon icon={icon} size={size} className="btn-icon" />}
      <span className="break-all text-wrap text-left">{children}</span>
    </button>
  );
};

export default Button;
