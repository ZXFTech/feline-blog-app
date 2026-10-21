"use client";

import { useId, useLayoutEffect, useState, type MouseEvent } from "react";
import { useBlogToc } from "@/components/Blog/BlogReading";
import { Button, buttonVariants } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import { cn } from "@/lib/utils";
import type { ReadingHeading } from "@/lib/blog/reading";

interface TocViewProps {
  headings: Pick<ReadingHeading, "id" | "text" | "level">[];
  activeId: string | null;
  onNavigate?: (id: string) => void;
  isolated?: boolean;
}

export function TocView({ headings, activeId, onNavigate, isolated }: TocViewProps) {
  function activate(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (
      !onNavigate ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.currentTarget.target === "_blank"
    )
      return;
    event.preventDefault();
    onNavigate(id);
  }
  return (
    <nav aria-label="本文目录" className="min-w-0 p-0">
      <ol className="m-0 flex min-w-0 list-none flex-col gap-[var(--spacing-panel-gap-compact)] p-0">
        {headings.map((heading) => (
          <li
            key={heading.id}
            className="min-w-0 p-0"
            style={{
              paddingInlineStart: `calc(${heading.level - 1} * var(--spacing-panel-inset-compact))`,
            }}
          >
            <a
              href={
                isolated
                  ? `#${encodeURIComponent(heading.id)}`
                  : `${typeof window === "undefined" ? "" : window.location.pathname + window.location.search}#${encodeURIComponent(heading.id)}`
              }
              onClick={(event) => activate(event, heading.id)}
              aria-current={activeId === heading.id ? "location" : undefined}
              aria-label={`${heading.text}，${heading.level} 级标题`}
              className={cn(
                buttonVariants({ size: "md" }),
                "blog-toc-link h-auto w-full min-w-0 justify-start whitespace-normal border-s-2 border-transparent text-start text-foreground shadow-none hover:bg-muted [overflow-wrap:anywhere]",
                activeId === heading.id && "border-foreground bg-muted font-bold"
              )}
            >
              <span className="sr-only">{heading.level} 级标题：</span>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function TOC({ compact = false }: { compact?: boolean }) {
  const state = useBlogToc();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  useLayoutEffect(() => () => setExpanded(false), []);
  if (!state?.headings.length) return null;
  const active = state.headings.find((item) => item.id === state.activeId);
  const view = (
    <TocView
      {...state}
      onNavigate={(target) => {
        setExpanded(false);
        state.navigate(target);
      }}
    />
  );
  if (!compact)
    return (
      <NeuPanel className="blog-toc-desktop min-w-0">
        <p className="font-bold text-sm">本文目录</p>
        {view}
      </NeuPanel>
    );
  return (
    <NeuPanel className="blog-toc-compact min-w-0">
      <Button
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
        className="h-auto min-w-0 justify-start whitespace-normal text-start [overflow-wrap:anywhere]"
      >
        本文目录{active ? `：${active.text}` : ""}
      </Button>
      <div id={id} hidden={!expanded} className="min-w-0 p-0">
        {view}
      </div>
    </NeuPanel>
  );
}
