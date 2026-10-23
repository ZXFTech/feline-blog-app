"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import { InputField } from "@/components/ui/input-field";
import { PermissionAccess } from "@/components/Auth/PermissionAccess";
import { BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { normalizeBlogQuery } from "@/lib/blog/query";

interface BlogListOperationBarProps {
  empty?: boolean;
}

interface SearchInput {
  urlKey: string;
  value: string;
  submission?: { urlKey: string; value: string };
}

export function BlogListOperationBar({ empty = false }: BlogListOperationBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const urlKey = `${pathname}?${query}`;
  const current = normalizeBlogQuery(
    searchParams.get("content") ?? undefined,
    searchParams.get("orderBy") ?? undefined
  );
  const [input, setInput] = useState<SearchInput>({ urlKey, value: current.content });
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const version = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // A response to our own search must not replace edits made while it was loading.
  if (input.urlKey !== urlKey) {
    const submission = input.submission?.urlKey === urlKey ? input.submission : undefined;
    setInput({
      urlKey,
      value: submission && input.value !== submission.value ? input.value : current.content,
      submission,
    });
  }

  function cancel() {
    version.current++;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => {
    const onHistory = () => {
      cancel();
      const target = new URLSearchParams(window.location.search);
      setInput({
        urlKey: `${window.location.pathname}?${target}`,
        value: target.get("content")?.trim() ?? "",
      });
    };
    window.addEventListener("popstate", onHistory);
    return () => {
      cancel();
      window.removeEventListener("popstate", onHistory);
    };
  }, []);

  useEffect(() => {
    if (urlKey !== input.submission?.urlKey) cancel();
  }, [urlKey, input.submission?.urlKey]);

  function submit(value: string, orderBy?: "asc" | "desc") {
    const params = new URLSearchParams(window.location.search);
    const browserUrlKey = `${window.location.pathname}?${params}`;
    const content = value.trim();
    if (content) params.set("content", content);
    else params.delete("content");
    if (orderBy) params.set("orderBy", orderBy);
    const suffix = params.toString();
    const target = `${pathname}${suffix ? `?${suffix}` : ""}${window.location.hash}`;
    if (
      target === `${window.location.pathname}${window.location.search}${window.location.hash}` &&
      (!input.submission || input.submission.urlKey === browserUrlKey)
    )
      return;
    setInput((previous) => ({
      ...previous,
      submission: { urlKey: `${pathname}?${suffix}`, value },
    }));
    startTransition(() => router.replace(target, { scroll: false }));
  }

  function clear() {
    cancel();
    setInput({ urlKey, value: "" });
    inputRef.current?.focus({ preventScroll: true });
    submit("");
  }

  return (
    <div
      aria-busy={pending}
      className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)] p-0"
    >
      <NeuPanel>
        <label htmlFor="blog-content-search">搜索正文</label>
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0">
          <InputField
            id="blog-content-search"
            inputRef={inputRef}
            value={input.value}
            className="min-w-0 flex-1"
            onChange={(event) => {
              const value = event.target.value;
              setInput((previous) => ({ ...previous, value }));
              cancel();
              const requestVersion = version.current;
              timer.current = setTimeout(() => {
                if (requestVersion === version.current) submit(value);
              }, 500);
            }}
          />
          <Button
            onClick={() => {
              cancel();
              submit(input.value, current.orderBy === "asc" ? "desc" : "asc");
            }}
          >
            {current.orderBy === "asc" ? "按时间倒序" : "按时间正序"}
          </Button>
          {(input.value || current.content) && (!empty || !current.content) ? (
            <Button onClick={clear}>清除搜索</Button>
          ) : null}
          <PermissionAccess>
            <Button onClick={() => router.push("/blog/new")}>新建</Button>
          </PermissionAccess>
        </div>
        <p role="status">{pending ? "正在更新文章列表…" : "按文章正文搜索，可切换时间排序。"}</p>
      </NeuPanel>
      {empty ? (
        <BlogStatusPanel
          title={current.content ? "没有找到匹配的文章" : "暂时还没有文章"}
          description={
            current.content ? "你可以清除搜索，再看看其他文章。" : "这里还没有可供阅读的文章。"
          }
        >
          {current.content ? (
            <Button className="self-start" onClick={clear}>
              清除搜索
            </Button>
          ) : null}
        </BlogStatusPanel>
      ) : null}
    </div>
  );
}
