"use client";

import React, {
  ComponentPropsWithoutRef,
  ForwardedRef,
  ReactElement,
  RefAttributes,
  forwardRef,
} from "react";
import Button, {
  ButtonContent,
  ButtonProps,
  ButtonVisualProps,
  buttonClassNames,
} from "../Button";
import { NeuIntensity, NeuButtonType } from "@/types";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface NeuButtonOwnProps {
  neuType?: NeuButtonType;
  intensity?: NeuIntensity;
}

type ActionNeuButtonProps = NeuButtonOwnProps &
  Omit<ButtonProps, "buttonType"> & {
    buttonType?: Exclude<ButtonProps["buttonType"], "link">;
    href?: never;
  };

type LinkVisualProps = Pick<
  ButtonVisualProps,
  "btnSize" | "children" | "loading" | "icon" | "suffixIcon"
>;

type LinkNeuButtonProps = NeuButtonOwnProps &
  LinkVisualProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children"> & {
    buttonType: "link";
    className?: string;
  };

export type NeuButtonProps = ActionNeuButtonProps | LinkNeuButtonProps;

interface NeuButtonComponent {
  (
    props: ActionNeuButtonProps & RefAttributes<HTMLButtonElement>,
  ): ReactElement;
  (props: LinkNeuButtonProps & RefAttributes<HTMLAnchorElement>): ReactElement;
  displayName?: string;
}

const NeuButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  NeuButtonProps
>((props, ref) => {
  if (props.buttonType === "link") {
    const {
      neuType = "embossed",
      intensity = "normal",
      className,
      buttonType,
      href,
      btnSize,
      loading,
      icon,
      suffixIcon,
      children,
      ...linkProps
    } = props;
    const surfaceClassName = cn(
      "neu-btn",
      "bg-bg text-font",
      "m-1",
      `btn-${neuType}-${intensity}`,
      `neu-btn-${buttonType}`,
      className,
    );

    return (
      <Link
        ref={ref as ForwardedRef<HTMLAnchorElement>}
        href={href}
        className={buttonClassNames({
          className: surfaceClassName,
          btnSize,
          children,
          loading,
          icon,
          suffixIcon,
        })}
        {...linkProps}
      >
        <ButtonContent
          loading={loading}
          icon={icon}
          btnSize={btnSize}
          suffixIcon={suffixIcon}
        >
          {children}
        </ButtonContent>
      </Link>
    );
  }

  const {
    neuType = "embossed",
    intensity = "normal",
    className,
    buttonType,
    children,
    disabled,
    ...buttonProps
  } = props;
  const surfaceClassName = cn(
    "neu-btn",
    "bg-bg text-font",
    "m-1",
    `btn-${neuType}-${intensity}`,
    buttonType && `neu-btn-${buttonType}`,
    disabled && "disabled",
    className,
  );

  return (
    <Button
      ref={ref as ForwardedRef<HTMLButtonElement>}
      disabled={disabled}
      className={surfaceClassName}
      {...buttonProps}
    >
      {children}
    </Button>
  );
}) as NeuButtonComponent;

NeuButton.displayName = "NeuButton";

export default NeuButton;
