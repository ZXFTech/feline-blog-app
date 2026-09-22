import { randomUUID } from "node:crypto";
import Content from "@/components/Content";
import { ChecklistFormScreen } from "@/components/Checklist/ChecklistFormScreen";
import { NeuPanel } from "@/components/ui/neu-panel";
import { StyledLink } from "@/components/ui/styled-link";
import { requireAuth } from "@/lib/auth/userAuth";

export default async function NewChecklistPage() {
  const auth = await requireAuth();
  return (
    <Content className="checklist-content">
      <main className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-[var(--spacing-panel-inset-default)]">
        <header className="shrink-0">
          <h1 className="text-2xl font-bold">新建确认清单</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            设置一个明确截止时间，并写下所有需要确认的事项。
          </p>
        </header>
        {auth.status === "success" ? (
          <NeuPanel density="default" className="min-h-0 flex-1">
            <ChecklistFormScreen createRequestId={randomUUID()} />
          </NeuPanel>
        ) : (
          <NeuPanel density="comfortable">
            <h2 className="text-lg font-semibold">请先登录</h2>
            <p className="text-sm text-muted-foreground">登录后才能把清单保存到你的账号。</p>
            <StyledLink href="/login" variant="primary">
              前往登录
            </StyledLink>
          </NeuPanel>
        )}
      </main>
    </Content>
  );
}
