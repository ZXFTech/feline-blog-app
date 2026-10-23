"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from "react";
import type { ActionResult } from "@/lib/server/actionResult";
import { NeuPanel } from "@/components/ui/neu-panel";
import { Button } from "@/components/ui/button";
import { StyledLink } from "@/components/ui/styled-link";

interface AdjacentBlogInfo {
  id: number;
  title: string;
  createdAt: Date;
}
export interface AdjacentBlogData {
  prev: AdjacentBlogInfo | null;
  next: AdjacentBlogInfo | null;
}
type Failure = "temporary_failure" | "not_found" | "invalid_input";
export type AdjacentBlogsState =
  | { status: "loading"; previousError?: Failure }
  | { status: "ready"; data: AdjacentBlogData }
  | { status: "error"; reason: Failure };

const messages: Record<Failure, string> = {
  temporary_failure: "暂时无法读取相邻文章",
  not_found: "当前文章已不存在，相邻文章不可用",
  invalid_input: "无法读取此文章的相邻导航",
};

interface AdjacentBlogsViewProps {
  state: AdjacentBlogsState;
  onRetry: () => void;
  onIntent?: (href: string) => void;
  titleRef?: Ref<HTMLHeadingElement>;
  retryRef?: Ref<HTMLButtonElement>;
}

export function AdjacentBlogsView({
  state,
  onRetry,
  onIntent,
  titleRef,
  retryRef,
}: AdjacentBlogsViewProps) {
  const reason =
    state.status === "error"
      ? state.reason
      : state.status === "loading"
        ? state.previousError
        : undefined;
  const busy = state.status === "loading";
  const follow = (href: string) =>
    onIntent
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          onIntent(href);
        }
      : undefined;
  return (
    <NeuPanel
      aria-label="相邻文章"
      aria-busy={busy}
      className="min-w-0 mt-[var(--spacing-panel-gap-default)]"
    >
      <h2 ref={titleRef} tabIndex={-1} className="font-semibold">
        相邻文章
      </h2>
      {reason ? (
        <>
          <p role={state.status === "error" ? "alert" : undefined}>{messages[reason]}</p>
          <div className="flex flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0">
            <Button
              ref={retryRef}
              disabled={busy}
              focusableWhenDisabled
              className="aria-disabled:opacity-65"
              onClick={onRetry}
            >
              {busy ? "正在重试…" : "重试"}
            </Button>
            <StyledLink
              href="/blog"
              prefetch={onIntent ? false : undefined}
              onClick={follow("/blog")}
            >
              返回文章列表
            </StyledLink>
          </div>
        </>
      ) : state.status === "ready" ? (
        <div className="flex min-w-0 flex-wrap justify-between gap-[var(--spacing-panel-gap-default)] p-0">
          {state.data.prev ? (
            <StyledLink
              replace
              prefetch={onIntent ? false : undefined}
              className="h-auto min-w-0 max-w-full whitespace-normal break-words text-left"
              href={`/blog/${state.data.prev.id}`}
              onClick={follow(`/blog/${state.data.prev.id}`)}
            >
              更早：{state.data.prev.title}
            </StyledLink>
          ) : (
            <p>没有更早的文章</p>
          )}
          {state.data.next ? (
            <StyledLink
              replace
              prefetch={onIntent ? false : undefined}
              className="h-auto min-w-0 max-w-full whitespace-normal break-words text-left"
              href={`/blog/${state.data.next.id}`}
              onClick={follow(`/blog/${state.data.next.id}`)}
            >
              更新：{state.data.next.title}
            </StyledLink>
          ) : (
            <p>没有更新的文章</p>
          )}
          {!state.data.prev && !state.data.next ? <p>暂无其他文章</p> : null}
        </div>
      ) : null}
      <p role="status">
        {busy
          ? reason
            ? "正在重试相邻文章…"
            : "正在读取相邻文章…"
          : state.status === "ready"
            ? "相邻文章已更新"
            : ""}
      </p>
    </NeuPanel>
  );
}

interface AdjacentBlogsControllerProps {
  id: number;
  load: (id: number) => Promise<ActionResult<AdjacentBlogData>>;
  onIntent?: (href: string) => void;
}

async function readAdjacent(
  load: AdjacentBlogsControllerProps["load"],
  id: number
): Promise<ActionResult<AdjacentBlogData>> {
  try {
    return await load(id);
  } catch {
    return { status: "temporary_failure", message: "" };
  }
}

export function AdjacentBlogsController(props: AdjacentBlogsControllerProps) {
  return <AdjacentBlogsRequest key={props.id} {...props} />;
}

function AdjacentBlogsRequest({ id, load, onIntent }: AdjacentBlogsControllerProps) {
  const [state, setState] = useState<AdjacentBlogsState>({ status: "loading" });
  const version = useRef(0);
  const active = useRef(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const request = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const requestVersion = ++version.current;
    void readAdjacent(load, id).then((result) => {
      if (!active.current || version.current !== requestVersion) return;
      busy.current = false;
      restoreFocus.current =
        result.status === "success" &&
        trigger.current !== null &&
        document.activeElement === trigger.current;
      setState(
        result.status === "success"
          ? { status: "ready", data: result.data }
          : {
              status: "error",
              reason:
                result.status === "not_found" || result.status === "invalid_input"
                  ? result.status
                  : "temporary_failure",
            }
      );
    });
  }, [id, load]);

  useEffect(() => {
    active.current = true;
    busy.current = false;
    void request();
    return () => {
      active.current = false;
    };
  }, [request]);
  useLayoutEffect(() => {
    if (restoreFocus.current && document.activeElement === document.body)
      heading.current?.focus({ preventScroll: true });
    restoreFocus.current = false;
  }, [state]);

  return (
    <AdjacentBlogsView
      state={state}
      titleRef={heading}
      retryRef={trigger}
      onIntent={onIntent}
      onRetry={() => {
        if (busy.current || state.status !== "error") return;
        setState({ status: "loading", previousError: state.reason });
        void request();
      }}
    />
  );
}
