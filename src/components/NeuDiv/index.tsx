import type { NeuSurface, NeuSurfaceIntensity } from "@/types";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { neuSurfaceClassNames } from "./surface";

interface NeuDivProps extends ComponentPropsWithoutRef<"div"> {
  surface?: NeuSurface;
  intensity?: NeuSurfaceIntensity;
}

const NeuDiv = forwardRef<HTMLDivElement, NeuDivProps>(
  (
    {
      surface = "embossed",
      intensity = "normal",
      className,
      children,
      ...restProps
    },
    ref,
  ) => {
    const classNames = neuSurfaceClassNames({
      surface,
      intensity,
      className,
    });

    return (
      <div ref={ref} className={classNames} {...restProps}>
        {children}
      </div>
    );
  },
);

NeuDiv.displayName = "NeuDiv";

export default NeuDiv;
export { neuSurfaceClassNames } from "./surface";
export type { NeuSurfaceOptions } from "./surface";
