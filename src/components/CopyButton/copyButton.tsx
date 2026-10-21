"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "onClick" | "children" | "type"
> {
  code: string;
}

export type CopyButtonPros = CopyButtonProps;
type CopyState = "idle" | "copying" | "copied" | "failed";

function CopyControl({ code, className, disabled, ...props }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const active = useRef(true);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    if (pending.current) return;
    pending.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    setState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      if (!active.current) return;
      setState("copied");
      timer.current = setTimeout(() => {
        if (active.current) setState("idle");
      }, 1000);
    } catch {
      if (active.current) setState("failed");
    } finally {
      pending.current = false;
    }
  }

  return (
    <span className="blog-code-copy-control">
      <Button
        {...props}
        type="button"
        className={cn("blog-code-copy", state === "copied" && "text-status-success!", className)}
        size="icon"
        materialIcon={state === "copied" ? "check" : "file_copy"}
        aria-label="复制代码"
        title={state === "copied" ? "已复制" : "复制代码"}
        aria-busy={state === "copying"}
        disabled={disabled || state === "copying"}
        onClick={copy}
      />
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn("blog-code-copy-status", state !== "failed" && "sr-only")}
      >
        {state === "copied"
          ? "已复制"
          : state === "failed"
            ? "复制失败，请手动选择代码"
            : state === "copying"
              ? "复制中"
              : ""}
      </span>
    </span>
  );
}

export default function CopyButton(props: CopyButtonProps) {
  // Every text version owns its lifetime, including A → B → A updates.
  return <CopyControl key={props.code} {...props} />;
}
