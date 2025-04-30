import React, { FC } from "react";
import Button, { ButtonProps } from "../Button/button";
import classNames from "classnames";
import { NeuIntensity, NeuButtonType } from "@/types";
// import { getElementColor, getStyleProperty } from "../../utils/theme";

export interface NeuButtonProps extends ButtonProps {
  neuType?: NeuButtonType;
  intensity?: NeuIntensity;
  themeColorHex?: string;
}

const NeuButton: FC<NeuButtonProps> = (props) => {
  const {
    neuType = "embossed",
    intensity = "normal",
    className,
    type,
    ...restProps
  } = props;

  const classnames = classNames("neu-btn", className, {
    [`btn-${neuType}-${intensity}`]: neuType && intensity,
    [`neu-btn-${type}`]: type,
  });

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

  return <Button className={classnames} {...restProps} />;
};

export default NeuButton;
