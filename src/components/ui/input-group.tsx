import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputGroupVariants = cva(
  "group/input-group relative flex w-full items-center bg-background text-foreground shadow-neu-inset-sm outline-none transition-shadow has-[textarea]:h-auto has-[textarea]:flex-col has-[textarea]:items-stretch focus-within:ring-2 focus-within:ring-primary/50 has-[[aria-invalid=true]]:ring-2 has-[[aria-invalid=true]]:ring-destructive/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
  {
    variants: {
      size: {
        sm: "h-8 gap-1 rounded-md px-1",
        md: "h-9 gap-1 rounded-md px-1.5",
        lg: "h-11 gap-1.5 rounded-lg px-2",
        xl: "h-12 gap-1.5 rounded-lg px-2.5",
      },
    },
    defaultVariants: {
      size: "lg",
    },
  }
);

export interface InputGroupProps
  extends React.ComponentProps<"div">, VariantProps<typeof inputGroupVariants> {}

function InputGroup({ className, size, ...props }: InputGroupProps) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(inputGroupVariants({ size, className }))}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex items-center gap-1 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      align: {
        "inline-start": "order-first",
        "inline-end": "order-last",
        "block-start": "order-first w-full justify-start border-b border-border/60 pb-1 pt-1.5",
        "block-end": "order-last w-full justify-start border-t border-border/60 pb-1.5 pt-1",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
);

export interface InputGroupAddonProps
  extends React.ComponentProps<"div">, VariantProps<typeof inputGroupAddonVariants> {}

function InputGroupAddon({ className, align, ...props }: InputGroupAddonProps) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align ?? "inline-start"}
      className={cn(inputGroupAddonVariants({ align, className }))}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "min-h-16 w-full flex-1 resize-none border-0 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md font-sans font-semibold text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        ghost:
          "bg-transparent hover:bg-[color-mix(in_oklch,var(--foreground),transparent_92%)] active:bg-[color-mix(in_oklch,var(--foreground),transparent_86%)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-neu-raised-sm hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_10%)] active:shadow-neu-raised-pressed",
      },
      size: {
        xs: "h-6 px-2 text-[length:var(--text-btn-xs)]",
        sm: "h-7 px-2.5 text-[length:var(--text-btn-sm)]",
        "icon-xs": "size-6 p-0",
        "icon-sm": "size-7 p-0",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "xs",
    },
  }
);

export interface InputGroupButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof inputGroupButtonVariants> {}

function InputGroupButton({
  className,
  variant = "ghost",
  size = "xs",
  type = "button",
  ...props
}: InputGroupButtonProps) {
  return (
    <button
      type={type}
      data-slot="input-group-button"
      className={cn(inputGroupButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn(
        "flex items-center gap-1 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  inputGroupVariants,
};
