import React, {
  FC,
  ButtonHTMLAttributes,
  ReactNode,
  AnchorHTMLAttributes,
} from "react";

import classNames from "classnames";
import { IconSpinner } from "../Icon/presetIcon";
import Icon, { IconType } from "../Icon/icon";

export enum ButtonSize {
  Large = "lg",
  Small = "sm",
  Mini = "xs",
}

export enum ButtonType {
  Primary = "primary",
  Default = "default",
  Danger = "danger",
  Link = "link",
}

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
    size,
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
    [`${size}`]: size,
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
      {loading && <IconSpinner className="btn-loading" />}
      {icon && <Icon icon={icon} className="btn-icon" />}
      <span>{children}</span>
    </button>
  );
};

export default Button;
