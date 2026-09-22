"use client";

import Content from "@/components/Content";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";

export default function ChecklistsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Content>
      <main>
        <NeuPanel density="comfortable">
          <h1 className="text-xl font-semibold">清单页面遇到问题</h1>
          <p role="alert" className="text-sm text-muted-foreground">
            暂时无法加载，请稍后重试。
          </p>
          <Button onClick={reset}>重试</Button>
        </NeuPanel>
      </main>
    </Content>
  );
}
