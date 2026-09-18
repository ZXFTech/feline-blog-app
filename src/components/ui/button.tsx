import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import Icon, { type IconType } from "@/components/Icon";

/**
 * Exact 1:1 reproduction of the Figma "Button" component set
 * (types: default / primary / danger / warn / success — sizes: xs / sm / md / lg,
 * states: default / hover / pressed / disabled). Colors, radii, padding and type
 * scale are pulled straight from the design tokens in globals.css so the button
 * reacts correctly across every theme (light / dark / sugar / warm).
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap font-sans font-semibold transition-[background-color,box-shadow,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-65 active:scale-[0.99] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-[1em]",
  {
    variants: {
      variant: {
        default:
          "bg-secondary text-secondary-foreground shadow-neu-raised-sm hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_10%)] active:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_16%)] active:shadow-neu-raised-pressed",
        primary:
          "bg-primary text-primary-foreground shadow-neu-raised-sm hover:bg-[color-mix(in_oklch,var(--primary),white_18%)] active:bg-[color-mix(in_oklch,var(--primary),black_18%)] active:shadow-neu-raised-pressed",
        danger:
          "bg-status-error text-status-error-fg shadow-neu-raised-sm hover:bg-[color-mix(in_oklch,var(--status-error),white_18%)] active:bg-[color-mix(in_oklch,var(--status-error),black_18%)] active:shadow-neu-raised-pressed",
        warning:
          "bg-status-warning text-status-warning-fg shadow-neu-raised-sm hover:bg-[color-mix(in_oklch,var(--status-warning),white_18%)] active:bg-[color-mix(in_oklch,var(--status-warning),black_18%)] active:shadow-neu-raised-pressed",
        success:
          "bg-status-success text-status-success-fg shadow-neu-raised-sm hover:bg-[color-mix(in_oklch,var(--status-success),white_18%)] active:bg-[color-mix(in_oklch,var(--status-success),black_18%)] active:shadow-neu-raised-pressed",
      },
      size: {
        xs: "h-[1.375rem] rounded-[var(--radius-btn-xs)] px-2 py-1 text-[length:var(--text-btn-xs)] leading-[1.5]",
        sm: "h-[1.5625rem] rounded-[var(--radius-btn-sm)] px-2 py-1 text-[length:var(--text-btn-sm)] leading-[1.5]",
        md: "h-[1.8125rem] rounded-[var(--radius-btn-md)] px-[0.6rem] py-[0.3rem] text-[length:var(--text-btn-md)] leading-[1.5]",
        lg: "h-[2.0625rem] rounded-[var(--radius-btn-lg)] px-[0.6rem] py-[0.3rem] text-[length:var(--text-btn-lg)] leading-[1.5]",
        icon: "size-[1.8125rem] rounded-[var(--radius-btn-md)] p-0 text-[length:var(--text-btn-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "md",
  loading = false,
  materialIcon,
  materialIconAfter,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    materialIcon?: IconType;
    materialIconAfter?: IconType;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && <Loader2Icon className="animate-spin" />}
      {!loading && materialIcon ? <Icon icon={materialIcon} /> : null}
      {children}
      {materialIconAfter ? <Icon icon={materialIconAfter} /> : null}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
