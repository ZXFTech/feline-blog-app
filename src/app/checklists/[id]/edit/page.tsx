import Content from "@/components/Content";
import { ChecklistFormScreen } from "@/components/Checklist/ChecklistFormScreen";
import { NeuPanel } from "@/components/ui/neu-panel";
import { StyledLink } from "@/components/ui/styled-link";
import { getChecklistForEdit } from "@/db/checklistAction";

export default async function EditChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getChecklistForEdit(id);
  return (
    <Content className="checklist-content">
      <main className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-[var(--spacing-panel-inset-default)]">
        <header className="shrink-0">
          <h1 className="text-2xl font-bold">编辑确认清单</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            本次保存会原子更新清单和所有项目，不会留下部分修改。
          </p>
        </header>
        {result.status === "success" ? (
          <NeuPanel density="default" className="min-h-0 flex-1">
            <ChecklistFormScreen detail={result.data} />
          </NeuPanel>
        ) : (
          <NeuPanel density="comfortable">
            <h2 className="text-lg font-semibold">无法编辑清单</h2>
            <p role="alert" className="text-sm text-muted-foreground">
              {result.message}
            </p>
            <StyledLink href="/checklists">返回清单</StyledLink>
          </NeuPanel>
        )}
      </main>
    </Content>
  );
}
