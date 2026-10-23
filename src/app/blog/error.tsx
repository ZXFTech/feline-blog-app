"use client";

import Content from "@/components/Content";
import { BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { BlogRecovery } from "@/components/Blog/BlogRecovery";

interface BlogErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function BlogError({ retry }: BlogErrorProps) {
  return (
    <Content className="mx-auto max-w-[700px]">
      <BlogStatusPanel
        failure
        pageTitle
        title="Blog 页面暂时无法加载"
        description="页面遇到了意外问题，你可以重新读取当前页面，或返回文章列表。"
      >
        <BlogRecovery onRetry={retry} />
      </BlogStatusPanel>
    </Content>
  );
}
