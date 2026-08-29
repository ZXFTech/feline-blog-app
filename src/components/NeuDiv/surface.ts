import { cn } from "@/lib/utils";
import type {
  NeuInteractionEffect,
  NeuSurface,
  NeuSurfaceIntensity,
} from "@/types";

interface NeuSurfaceBaseOptions {
  surface?: NeuSurface;
  intensity?: NeuSurfaceIntensity;
  className?: string;
}

export type NeuSurfaceOptions =
  | (NeuSurfaceBaseOptions & {
      surface?: "embossed" | "debossed";
      interactionEffect?: never;
    })
  | (NeuSurfaceBaseOptions & {
      surface: "flat";
      interactionEffect?: NeuInteractionEffect;
    });

export function neuSurfaceClassNames(options: NeuSurfaceOptions = {}): string {
  const {
    surface = "embossed",
    intensity = "normal",
    interactionEffect,
    className,
  } = options;

  return cn(
    "neu-div",
    "bg-bg text-font",
    "p-2 transition duration-100 border border-border rounded-lg",
    surface !== "flat" && `neu-${surface}-${intensity}`,
    interactionEffect && `neu-interaction-${interactionEffect}-${intensity}`,
    surface === "embossed" && "p-1",
    className,
  );
}
