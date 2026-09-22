import Content from "@/components/Content";
import { ChecklistListFilters } from "@/components/Checklist/ChecklistListFilters";
import { ChecklistVirtualGrid } from "@/components/Checklist/ChecklistVirtualGrid";
import { NeuPanel } from "@/components/ui/neu-panel";
import { StyledLink } from "@/components/ui/styled-link";
import { getChecklists } from "@/db/checklistAction";

interface ChecklistPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChecklistsPage({ searchParams }: ChecklistPageProps) {
  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const expiry = value("expiry") as "active" | "expired" | undefined;
  const confirmation = value("confirmation") as
    | "all"
    | "confirmed"
    | "partial"
    | "unconfirmed"
    | undefined;
  const q = value("q") ?? "";
  const result = await getChecklists({ expiry, confirmation, q });

  return (
    <Content
      rightSideBarFirstOnCompact
      rightSideBar={
        <NeuPanel density="compact">
          <ChecklistListFilters />
        </NeuPanel>
      }
    >
      <main className="flex h-full min-h-[36rem] flex-col gap-4 p-[var(--spacing-panel-inset-default)]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">确认清单</h1>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <StyledLink href="/checklists/trash">回收站</StyledLink>
            <StyledLink href="/checklists/new" variant="primary">
              新建清单
            </StyledLink>
          </div>
        </header>
        {result.status === "unauthenticated" ? (
          <NeuPanel density="comfortable">
            <h2 className="text-lg font-semibold">登录后使用清单</h2>
            <p className="text-sm text-muted-foreground">
              清单是你的私人数据，登录后才能创建和查看。
            </p>
            <StyledLink href="/login" variant="primary">
              前往登录
            </StyledLink>
          </NeuPanel>
        ) : result.status !== "success" ? (
          <NeuPanel density="comfortable">
            <h2 className="text-lg font-semibold">暂时无法读取清单</h2>
            <p role="alert" className="text-sm text-destructive">
              {result.message}
            </p>
            <StyledLink href="/checklists">重置筛选并重试</StyledLink>
          </NeuPanel>
        ) : result.data.items.length === 0 ? (
          expiry === "expired" ? (
            <NeuPanel density="comfortable">
              <h2 className="text-lg font-semibold">没有已过期的清单</h2>
              <StyledLink href="/checklists" variant="primary">
                重置筛选
              </StyledLink>
            </NeuPanel>
          ) : (
            <NeuPanel density="comfortable">
              <h2 className="text-lg font-semibold">这里还没有符合条件的清单</h2>
              <p className="text-sm text-muted-foreground">
                你可以调整筛选，或创建第一份有截止时间的确认清单。
              </p>
              <StyledLink href="/checklists/new" variant="primary">
                创建清单
              </StyledLink>
            </NeuPanel>
          )
        ) : (
          <ChecklistVirtualGrid
            initial={result.data}
            query={{ expiry: expiry ?? "active", confirmation: confirmation ?? "all", q }}
          />
        )}
      </main>
    </Content>
  );
}
