"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoProps } from "@/app/album/_components/catalog";
import { BlogEmptyBody, BlogLoadingState, BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { AdjacentBlogsView, type AdjacentBlogData } from "@/components/Blog/AdjacentBlogsView";
import { Button } from "@/components/ui/button";
import { StyledLink } from "@/components/ui/styled-link";

const scenarios = [
  "加载",
  "空列表",
  "搜索无结果",
  "读取失败",
  "404",
  "空正文",
  "相邻成功",
  "相邻失败",
] as const;
type Scenario = (typeof scenarios)[number];
const neighbors: AdjacentBlogData = {
  prev: { id: 1, title: "固定本地文章，关于阅读与恢复", createdAt: new Date("2026-10-22") },
  next: null,
};

interface LocalScenarioProps {
  scenario: Scenario;
  onIntent: (href: string) => void;
}

function LocalScenario({ scenario, onIntent }: LocalScenarioProps) {
  const [phase, setPhase] = useState<"idle" | "pending" | "ready">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  function recover() {
    if (timer.current) return;
    setPhase("pending");
    timer.current = setTimeout(() => {
      setPhase("ready");
      timer.current = null;
    }, 300);
  }
  if (scenario === "加载") return <BlogLoadingState />;
  if (scenario === "空正文")
    return (
      <BlogStatusPanel title="固定本地空文章" description="作者：本地样例，标签：阅读">
        <BlogEmptyBody />
      </BlogStatusPanel>
    );
  if (scenario === "相邻成功")
    return (
      <AdjacentBlogsView
        state={{ status: "ready", data: neighbors }}
        onRetry={() => {}}
        onIntent={onIntent}
      />
    );
  if (scenario === "相邻失败")
    return (
      <AdjacentBlogsView
        state={
          phase === "ready"
            ? { status: "ready", data: neighbors }
            : phase === "pending"
              ? { status: "loading", previousError: "temporary_failure" }
              : { status: "error", reason: "temporary_failure" }
        }
        onRetry={recover}
        onIntent={onIntent}
      />
    );
  if (phase === "ready")
    return (
      <BlogStatusPanel
        title="本地读取已恢复"
        description="这次恢复只更新内存，没有发送业务请求。"
      />
    );
  const title =
    scenario === "空列表"
      ? "暂时还没有文章"
      : scenario === "搜索无结果"
        ? "没有找到匹配的文章"
        : scenario === "404"
          ? "404"
          : "暂时无法读取文章列表";
  return (
    <BlogStatusPanel
      title={title}
      failure={scenario === "读取失败"}
      description={
        scenario === "404" ? "文章不存在或已删除" : "这是固定本地样例。恢复操作只改变此演示。"
      }
      busy={phase === "pending"}
    >
      {scenario !== "空列表" ? (
        <div className="flex flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0">
          <Button disabled={phase === "pending"} onClick={recover}>
            {phase === "pending"
              ? "正在重新读取…"
              : scenario === "404"
                ? "重新检查"
                : scenario === "搜索无结果"
                  ? "清除搜索"
                  : "重试"}
          </Button>
          <StyledLink
            href="/blog"
            prefetch={false}
            variant={scenario === "404" ? "primary" : "default"}
            onClick={(event) => {
              event.preventDefault();
              onIntent("/blog");
            }}
          >
            返回文章列表
          </StyledLink>
        </div>
      ) : null}
      <p role="status">{phase === "pending" ? "正在恢复本地样例…" : ""}</p>
    </BlogStatusPanel>
  );
}

export default function BlogStatusDemo({ compact = false }: DemoProps) {
  const [scenario, setScenario] = useState<Scenario>("读取失败");
  const [intent, setIntent] = useState("");
  return (
    <section
      aria-label={compact ? "Blog 状态主题样例" : "Blog 状态本地演示"}
      className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)] p-0"
    >
      {!compact ? (
        <>
          <p>仅使用本地状态。文章与返回链接只记录意图，保留 Album 地址。</p>
          <div className="flex flex-wrap gap-[var(--spacing-panel-gap-default)] p-0">
            {scenarios.map((name) => (
              <Button
                key={name}
                aria-pressed={scenario === name}
                onClick={() => {
                  setScenario(name);
                  setIntent("");
                }}
              >
                {name}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <LocalScenario key={scenario} scenario={scenario} onIntent={setIntent} />
      <p role="status">{intent ? `已记录导航意图：${intent}` : ""}</p>
    </section>
  );
}
