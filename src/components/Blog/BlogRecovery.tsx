"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";

export function BlogRecovery() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div
      aria-busy={pending}
      className="flex flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0"
    >
      <Button
        disabled={pending}
        focusableWhenDisabled
        className="aria-disabled:opacity-65"
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "正在重新读取…" : "重试"}
      </Button>
      <Link href="/blog" className={buttonVariants()}>
        返回文章列表
      </Link>
      <span className="sr-only" role="status">
        {pending ? "正在重新读取当前页面" : ""}
      </span>
    </div>
  );
}
