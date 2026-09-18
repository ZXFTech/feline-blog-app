import { cva, type VariantProps } from "class-variance-authority";

import { NeuSurface, type NeuSurfaceProps } from "@/components/ui/neu-surface";
import { cn } from "@/lib/utils";

const neuPanel = cva("", {
  variants: {
    density: {
      compact: "p-[var(--spacing-panel-inset-compact)] gap-[var(--spacing-panel-gap-compact)]",
      default: "p-[var(--spacing-panel-inset-default)] gap-[var(--spacing-panel-gap-default)]",
      comfortable:
        "p-[var(--spacing-panel-inset-comfortable)] gap-[var(--spacing-panel-gap-comfortable)]",
    },
    layout: {
      stack: "flex flex-col",
      row: "flex flex-row",
      grid: "grid",
    },
  },
  defaultVariants: {
    density: "default",
    layout: "stack",
  },
});

export interface NeuPanelProps extends NeuSurfaceProps, VariantProps<typeof neuPanel> {}

export function NeuPanel({
  className,
  density,
  layout,
  elevation,
  radius,
  ...props
}: NeuPanelProps) {
  return (
    <NeuSurface
      className={cn(neuPanel({ density, layout }), className)}
      elevation={elevation}
      radius={radius}
      {...props}
    />
  );
}

export { neuPanel };
