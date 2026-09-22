import Content from "@/components/Content";
import { ChecklistTrashView } from "@/components/Checklist/ChecklistTrashView";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import { StyledLink } from "@/components/ui/styled-link";
import { getChecklistTrash } from "@/db/checklistAction";

export default async function ChecklistTrashPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const content = await getChecklistTrash({ q }).then((result) =>
    result.status === "success" ? (
      <ChecklistTrashView initial={result.data} query={q} />
    ) : (
      <NeuPanel density="comfortable">
        <p role="alert" className="text-sm text-destructive">
          {result.message}
        </p>
      </NeuPanel>
    )
  );
  return (
    <Content>
      <main className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">清单回收站</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              已删除清单保留三十天，项目请在所属清单详情中恢复。
            </p>
          </div>
          <StyledLink href="/checklists">返回</StyledLink>
        </header>
        <form action="/checklists/trash" className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">搜索已删除清单</span>
            <input
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder="搜索清单或项目详情"
              className="min-h-11 w-full rounded-lg bg-background px-3 py-2 text-sm shadow-neu-inset-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>
          <Button type="submit">搜索</Button>
        </form>
        {content}
      </main>
    </Content>
  );
}
