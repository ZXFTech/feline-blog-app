import { cn } from "@/lib/utils";
import { NeuIntensity, NeuType } from "@/types";
import React, { forwardRef, HTMLAttributes } from "react";

interface NeuContainerProps extends HTMLAttributes<HTMLDivElement> {
  neuType?: NeuType;
  intensity?: NeuIntensity;
}

const NeuDiv = forwardRef<HTMLDivElement, NeuContainerProps>((props, ref) => {
  const {
    neuType = "embossed",
    intensity = "normal",
    className,
    children,
    ...restProps
  } = props;

  const configClassNames = cn(
    "neu-div",
    "bg-bg text-font",
    "p-2 transition duration-100 border border-border rounded-lg ",
    {
      [`neu-${neuType}-${intensity}`]: neuType && intensity,
      "p-1": neuType === "embossed",
    },
    className,
  );

  return (
    <div ref={ref} className={configClassNames} {...restProps}>
      {children}
    </div>
  );
});
NeuDiv.displayName = "NeuDIv";
export default NeuDiv;
