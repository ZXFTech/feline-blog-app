import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const neuSurface = cva("bg-background transition-shadow", {
  variants: {
    elevation: {
      raised: "shadow-neu-raised",
      "raised-sm": "shadow-neu-raised-sm",
      inset: "shadow-neu-inset",
      "inset-sm": "shadow-neu-inset-sm",
      flat: "shadow-none",
    },
    radius: {
      sm: "rounded-sm",
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      full: "rounded-full",
    },
  },
  defaultVariants: {
    elevation: "raised",
    radius: "lg",
  },
});

export interface NeuSurfaceProps
  extends React.ComponentPropsWithRef<"div">, VariantProps<typeof neuSurface> {}

export function NeuSurface({ className, elevation, radius, ...props }: NeuSurfaceProps) {
  return <div className={cn(neuSurface({ elevation, radius }), className)} {...props} />;
}

export { neuSurface };
