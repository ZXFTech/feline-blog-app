import Link from "next/link";
import type { ComponentPropsWithRef } from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StyledLinkProps
  extends ComponentPropsWithRef<typeof Link>, VariantProps<typeof buttonVariants> {}

export function StyledLink({ className, variant, size, ...props }: StyledLinkProps) {
  const path = typeof props.href === "string" ? props.href.split(/[?#]/)[0] : props.href.pathname;
  if (path && ["/login", "/register", "/profile"].includes(path)) {
    const anchor = Object.fromEntries(Object.entries(props).filter(([key]) => !["href", "prefetch", "replace", "scroll", "shallow", "locale", "onNavigate"].includes(key)));
    return <a {...anchor} href={path} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} />;
  }
  return (
    <Link
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
