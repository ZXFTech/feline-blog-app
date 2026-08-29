import { cn } from "@/lib/utils";
import type { NeuIntensity, NeuType } from "@/types";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

interface NeuDivProps extends ComponentPropsWithoutRef<"div"> {
  neuType?: NeuType;
  intensity?: NeuIntensity;
}

const NeuDiv = forwardRef<HTMLDivElement, NeuDivProps>(
  (
    {
      neuType = "embossed",
      intensity = "normal",
      className,
      children,
      ...restProps
    },
    ref,
  ) => {
    const classNames = cn(
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
      <div ref={ref} className={classNames} {...restProps}>
        {children}
      </div>
    );
  },
);

NeuDiv.displayName = "NeuDiv";

export default NeuDiv;
