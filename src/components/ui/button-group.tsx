import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonGroupVariants = cva(
  [
    "group/button-group flex w-fit items-stretch rounded-[var(--radius-btn-lg)] shadow-neu-raised-sm",
    "has-[>[data-slot=input-group]]:shadow-none has-[>[data-slot=input]]:bg-background has-[>[data-slot=input]]:shadow-neu-inset-sm",
    "[&>[data-slot=button]]:rounded-none [&>[data-slot=button]]:shadow-none [&>[data-slot=button]]:active:scale-100 [&>[data-slot=button]]:active:shadow-none",
    "[&>[data-slot=input]]:rounded-none [&>[data-slot=input]]:border-0 [&>[data-slot=input]]:bg-transparent [&>[data-slot=input]]:shadow-none [&>[data-slot=input]]:focus-visible:ring-0",
    "[&>*]:focus-visible:z-10 [&>*]:focus-visible:ring-2 [&>*]:focus-visible:ring-ring/50",
  ],
  {
    variants: {
      orientation: {
        horizontal: [
          "flex-row",
          "[&>[data-slot=button]:first-child]:rounded-l-[inherit] [&>[data-slot=button]:last-child]:rounded-r-[inherit]",
          "[&>[data-slot=input]:first-child]:rounded-l-[inherit] [&>[data-slot=input]:last-child]:rounded-r-[inherit]",
          "[&>:not(:first-child)]:border-l [&>:not(:first-child)]:border-foreground/15",
        ],
        vertical: [
          "flex-col",
          "[&>[data-slot=button]:first-child]:rounded-t-[inherit] [&>[data-slot=button]:last-child]:rounded-b-[inherit]",
          "[&>[data-slot=input]:first-child]:rounded-t-[inherit] [&>[data-slot=input]:last-child]:rounded-b-[inherit]",
          "[&>:not(:first-child)]:border-t [&>:not(:first-child)]:border-foreground/15",
        ],
      },
      size: {
        sm: "has-[>[data-slot=input]]:h-8 has-[>[data-slot=input]]:[&>[data-slot=button]]:!h-full has-[>[data-slot=input]]:[&>[data-slot=input]]:!h-full",
        md: "has-[>[data-slot=input]]:h-9 has-[>[data-slot=input]]:[&>[data-slot=button]]:!h-full has-[>[data-slot=input]]:[&>[data-slot=input]]:!h-full",
        lg: "has-[>[data-slot=input]]:h-11 has-[>[data-slot=input]]:[&>[data-slot=button]]:!h-full has-[>[data-slot=input]]:[&>[data-slot=input]]:!h-full",
        xl: "has-[>[data-slot=input]]:h-12 has-[>[data-slot=input]]:[&>[data-slot=button]]:!h-full has-[>[data-slot=input]]:[&>[data-slot=input]]:!h-full",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
      size: "lg",
    },
  }
);

export interface ButtonGroupProps
  extends React.ComponentPropsWithoutRef<"div">, VariantProps<typeof buttonGroupVariants> {}

function ButtonGroup({ className, orientation, size, ...props }: ButtonGroupProps) {
  return (
    <div
      data-slot="button-group"
      role="group"
      data-orientation={orientation ?? "horizontal"}
      className={cn(buttonGroupVariants({ orientation, size }), className)}
      {...props}
    />
  );
}

export interface ButtonGroupSeparatorProps extends React.ComponentPropsWithoutRef<"div"> {
  orientation?: "horizontal" | "vertical";
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: ButtonGroupSeparatorProps) {
  return (
    <div
      data-slot="button-group-separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-foreground/15",
        orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
        className
      )}
      {...props}
    />
  );
}

export interface ButtonGroupTextProps extends React.ComponentPropsWithoutRef<"div"> {
  render?: React.ReactElement<{
    className?: string;
    children?: React.ReactNode;
    "data-slot"?: string;
  }>;
}

function ButtonGroupText({ className, render, children, ...props }: ButtonGroupTextProps) {
  const classes = cn(
    "flex items-center gap-1.5 bg-muted px-3 text-[length:var(--text-btn-sm)] font-medium text-muted-foreground",
    className
  );

  if (render) {
    return React.cloneElement(render, {
      "data-slot": "button-group-text",
      className: cn(classes, render.props.className),
      children: render.props.children ?? children,
    });
  }

  return (
    <div data-slot="button-group-text" className={classes} {...props}>
      {children}
    </div>
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
