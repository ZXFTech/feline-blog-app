import type { DemoProps } from "@/app/album/_components/catalog";
import { DemoSection } from "@/app/album/_components/demos/DemoSection";
import {
  blogLongCode,
  blogMarkdownCompact,
  blogMarkdownSample,
} from "@/app/album/_components/fixtures/blog-markdown";
import { BlogMarkdown } from "@/components/Blog/BlogMarkdown";
import { CodeBlock } from "@/components/Blog/CodeBlock";

export default function BlogMarkdownDemo({ compact = false }: DemoProps) {
  if (compact) return <BlogMarkdown content={blogMarkdownCompact} />;
  return (
    <div className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-comfortable)]">
      <DemoSection title="正文结构与语言回退">
        <div className="min-w-0 w-full">
          <BlogMarkdown content={blogMarkdownSample} />
        </div>
      </DemoSection>
      <DemoSection title="原始空白、长行与独立换行">
        <div className="flex min-w-0 w-full flex-col gap-[var(--spacing-panel-gap-default)]">
          <p>每个块单独切换换行。复制反馈来自当前浏览器；剪贴板不可用时可手动选择代码。</p>
          <CodeBlock title="首尾空行与超长行" code={blogLongCode} language="TS" />
          <CodeBlock title="第二个独立代码块" code={'const second = "独立状态";\n'} language="js" />
        </div>
      </DemoSection>
    </div>
  );
}
