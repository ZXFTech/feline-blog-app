import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "w-full min-w-0 bg-background text-foreground shadow-neu-inset-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/60",
  {
    variants: {
      size: {
        sm: "h-8 rounded-md px-2.5 text-xs",
        md: "h-9 rounded-md px-3 text-sm",
        lg: "h-11 rounded-lg px-3 text-sm",
        xl: "h-12 rounded-lg px-4 text-base",
      },
    },
    defaultVariants: {
      size: "lg",
    },
  }
);

type InputVisualSize = NonNullable<VariantProps<typeof inputVariants>["size"]>;

export interface InputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: number | InputVisualSize;
}

function Input({ className, size = "lg", type = "text", ...props }: InputProps) {
  const visualSize = typeof size === "string" ? size : "lg";
  const nativeSize = typeof size === "number" ? size : undefined;

  return (
    <input
      type={type}
      data-slot="input"
      size={nativeSize}
      className={cn(inputVariants({ size: visualSize, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };
