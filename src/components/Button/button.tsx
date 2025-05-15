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

export type ButtonType = "primary" | "default" | "danger" | "link";

interface BaseButtonProps {
  className: string;
  disabled?: boolean;
  size?: ButtonSize;
  type?: ButtonType;
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
    type,
    href,
    children,
    loading,
    icon,
    ...restProps
  } = props;

  // 配置 classnames
  const configClassNames = classNames("btn", className, {
    [`btn-${type}`]: type,
    [`btn-${size}`]: size,
    disabled: disabled,
    loading: loading,
  });

  if (type === "link") {
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
