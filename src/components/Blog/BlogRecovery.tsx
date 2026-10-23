"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";

interface BlogRecoveryProps {
  label?: string;
  onRetry?: () => void;
  listPrimary?: boolean;
  reloadDocument?: boolean;
}

export function BlogRecovery({
  label = "重试",
  onRetry,
  listPrimary = false,
  reloadDocument = false,
}: BlogRecoveryProps) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [reloading, setReloading] = useState(false);
  const pending = transitionPending || reloading;
  const button = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    inFlight.current = pending;
  }, [pending]);
  useLayoutEffect(() => {
    const trigger = button.current;
    return () => {
      if (trigger !== document.activeElement) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body && document.activeElement !== trigger) return;
        document
          .querySelector<HTMLElement>("[data-blog-result-title], [data-blog-title]")
          ?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <div
      aria-busy={pending}
      className="flex flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0"
    >
      <Button
        ref={button}
        disabled={pending}
        focusableWhenDisabled
        className="aria-disabled:opacity-65"
        onClick={() => {
          if (inFlight.current) return;
          inFlight.current = true;
          if (reloadDocument) {
            // A same-path refresh preserves Next's triggered not-found boundary.
            setReloading(true);
            window.location.reload();
            return;
          }
          startTransition(() => {
            (onRetry ?? router.refresh)();
          });
        }}
      >
        {pending ? "正在重新读取…" : label}
      </Button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Document navigation clears an existing /blog error boundary. */}
      <a
        href="/blog"
        data-slot="button"
        className={buttonVariants({ variant: listPrimary ? "primary" : "default" })}
      >
        返回文章列表
      </a>
      <span role="status">{pending ? "正在重新读取当前页面" : ""}</span>
    </div>
  );
}
