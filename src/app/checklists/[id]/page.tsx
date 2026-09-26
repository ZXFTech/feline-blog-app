import Content from "@/components/Content";
import { ChecklistDetailView } from "@/components/Checklist/ChecklistDetailView";
import { NeuPanel } from "@/components/ui/neu-panel";
import { StyledLink } from "@/components/ui/styled-link";
import { getChecklistDetail } from "@/db/checklistAction";

export default async function ChecklistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getChecklistDetail(id);
  return (
    <Content className="checklist-content">
      <main className="h-full min-h-0 w-full p-[var(--spacing-panel-inset-default)]">
        {result.status === "success" ? (
          <ChecklistDetailView initial={result.data} />
        ) : (
          <NeuPanel density="comfortable">
            <h1 className="text-xl font-semibold">无法打开清单</h1>
            <p role="alert" className="text-sm text-muted-foreground">
              {result.message}
            </p>
            <StyledLink href={result.status === "unauthenticated" ? "/login" : "/checklists"}>
              {result.status === "unauthenticated" ? "前往登录" : "返回清单"}
            </StyledLink>
          </NeuPanel>
        )}
      </main>
    </Content>
  );
}
