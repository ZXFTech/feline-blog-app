import { NeuIntensity, NeuType } from "@/types";
import classNames from "classnames";
import React, { FC, HTMLAttributes } from "react";

interface NeuContainerProps extends HTMLAttributes<HTMLDivElement> {
  neuType?: NeuType;
  intensity?: NeuIntensity;
}

const NeuDiv: FC<NeuContainerProps> = (props) => {
  const {
    neuType = "embossed",
    intensity = "normal",
    className,
    children,
    ...restProps
  } = props;

  const configClassNames = classNames(
    "neu-div",
    {
      [`neu-${neuType}-${intensity}`]: neuType && intensity,
      "m-4 p-1": neuType === "embossed",
    },
    className
  );

  return (
    <div
      className={`p-2 transition duration-100 border rounded-lg ${configClassNames}`}
      {...restProps}
    >
      {children}
    </div>
  );
};

export default NeuDiv;
