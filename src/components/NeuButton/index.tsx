"use client";

import React, { FC, forwardRef } from "react";
import Button, { ButtonProps } from "../Button";
import classNames from "classnames";
import { NeuIntensity, NeuButtonType } from "@/types";
import Link from "next/link";
// import { getElementColor, getStyleProperty } from "../../utils/theme";

export interface NeuButtonProps extends ButtonProps {
  neuType?: NeuButtonType;
  intensity?: NeuIntensity;
  themeColorHex?: string;
}

const NeuButton = forwardRef<
  HTMLButtonElement & HTMLAnchorElement,
  NeuButtonProps
>((props, ref) => {
  const {
    neuType = "embossed",
    intensity = "normal",
    className,
    buttonType,
    children,
    disabled,
    href = "",
    ...restProps
  } = props;

  const classnames = classNames(
    "neu-btn",
    "m-1",
    {
      [`btn-${neuType}-${intensity}`]: neuType && intensity,
      [`neu-btn-${buttonType}`]: buttonType,
      disabled: disabled,
    },
    className
  );

  // const [combineStyle, setCombineStyle] = useState<React.CSSProperties>({});
  // useEffect(() => {
  //   const themeStyle: React.CSSProperties = {};
  //   if (themeColorHex) {
  //     const { darkShadow, lightShadow, borderColor, fontColor } =
  //       getElementColor(themeColorHex);

  //     const shadowSize = getStyleProperty(
  //       `--shadow-size-${props.size ? props.size : "normal"}`
  //     );
  //     console.log(getStyleProperty("--theme-light"));
  //     console.log(
  //       'document.documentElement.style.getPropertyValue("--theme-light")',
  //       document.documentElement.style.getPropertyValue("--theme-light")
  //     );
  //     const shadowBlur = getStyleProperty(
  //       `--shadow-blur-${props.size ? props.size : "normal"}`
  //     );

  //     themeStyle.boxShadow = `-${shadowSize} -${shadowSize} ${shadowBlur} ${lightShadow}, ${shadowSize} ${shadowSize} ${shadowBlur} ${darkShadow}`;
  //     themeStyle.color = fontColor;
  //     themeStyle.borderColor = borderColor;
  //   }

  //   setCombineStyle(themeStyle);
  // }, [themeColorHex, props]);
  // if (buttonType === "link") {
  //   return (
  //     <Link className={className} href={href} {...restProps}>
  //       {children}
  //     </Link>
  //   );
  // }

  return (
    <Button ref={ref} disabled={disabled} className={classnames} {...restProps}>
      {buttonType === "link" ? (
        <Link className="neu-btn-inner-link" href={href} {...restProps}>
          {children}
        </Link>
      ) : (
        children
      )}
    </Button>
  );
});

NeuButton.displayName = "NeuButton";

export default NeuButton;
