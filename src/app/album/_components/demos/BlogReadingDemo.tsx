"use client";

import { useId, useState } from "react";
import type { DemoProps } from "@/app/album/_components/catalog";
import { BlogReading } from "@/components/Blog/BlogReading";
import TOC, { TocView } from "@/components/Blog/TOC";
import { BlogMarkdown } from "@/components/Blog/BlogMarkdown";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";

const paragraphs = "这是固定的本地阅读样例，用于验证正文范围和章节定位。".repeat(24);
const samples = {
  长文:
    Array.from(
      { length: 6 },
      (_, index) =>
        `${"#".repeat(index + 1)} ${index ? `第 ${index + 1} 级章节` : "阅读起点"}\n\n${paragraphs}`
    ).join("\n\n") + "\n\n## 重复章节\n\n正文。\n\n## 重复章节\n\n末节。",
  短文: "## 简短章节\n\n这段正文无需纵向滚动，进度条隐藏。",
  无标题: paragraphs.repeat(6),
  空正文: "",
};

export default function BlogReadingDemo({ compact = false }: DemoProps) {
  const instanceId = useId();
  const [sample, setSample] = useState<keyof typeof samples>("长文");
  if (compact)
    return (
      <NeuPanel>
        <p className="font-bold">本文目录</p>
        <TocView
          headings={[
            { id: `${instanceId}-start`, text: "阅读起点", level: 1 },
            { id: `${instanceId}-deep`, text: "深层章节与当前阅读位置", level: 6 },
          ]}
          activeId={`${instanceId}-deep`}
          onNavigate={() => {}}
          isolated
        />
      </NeuPanel>
    );
  return (
    <div className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)] p-0">
      <p>目录与进度只读取下方固定样例。章节跳转保留当前 Album 地址。</p>
      <div className="flex flex-wrap gap-[var(--spacing-panel-gap-default)] p-0">
        {(Object.keys(samples) as (keyof typeof samples)[]).map((name) => (
          <Button key={name} aria-pressed={sample === name} onClick={() => setSample(name)}>
            {name}
          </Button>
        ))}
      </div>
      <div className="blog-reading-demo hide-scrollbar max-h-[60dvh] overflow-y-auto p-[var(--spacing-panel-inset-default)]">
        <BlogReading articleKey={`${instanceId}-${sample}`} articleTitle="本地阅读样例" isolated>
          <div className="content-container p-0">
            <TOC />
            <TOC compact />
            <BlogMarkdown content={samples[sample]} />
          </div>
        </BlogReading>
      </div>
    </div>
  );
}
