import type { ReactNode } from "react";
import { NeuPanel } from "@/components/ui/neu-panel";

interface BlogStatusPanelProps {
  title: string;
  description: string;
  children?: ReactNode;
  busy?: boolean;
  pageTitle?: boolean;
  failure?: boolean;
}

export function BlogStatusPanel({
  title,
  description,
  children,
  busy = false,
  pageTitle = false,
  failure = false,
}: BlogStatusPanelProps) {
  const Heading = pageTitle ? "h1" : "h2";
  return (
    <NeuPanel aria-busy={busy} className="min-w-0 break-words">
      <Heading tabIndex={-1} data-blog-result-title="" className="text-xl font-semibold">
        {title}
      </Heading>
      <p role={failure ? "alert" : undefined}>{description}</p>
      {children}
    </NeuPanel>
  );
}

export function BlogLoadingState() {
  return (
    <BlogStatusPanel title="正在加载 Blog" description="正在读取页面，请稍候。" busy pageTitle>
      <p role="status">正在加载文章内容…</p>
      <div aria-hidden="true" className="flex flex-col gap-[var(--spacing-panel-gap-default)] p-0">
        <div className="h-6 w-2/3 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-4/5 rounded bg-muted" />
      </div>
    </BlogStatusPanel>
  );
}

export function BlogEmptyBody() {
  return <p className="py-[var(--spacing-panel-inset-default)]">这是一篇空文章</p>;
}
