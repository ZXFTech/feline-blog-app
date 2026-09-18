import Link from "next/link";
import type { ComponentPropsWithRef } from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StyledLinkProps
  extends ComponentPropsWithRef<typeof Link>, VariantProps<typeof buttonVariants> {}

export function StyledLink({ className, variant, size, ...props }: StyledLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
