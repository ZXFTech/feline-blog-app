"use client";

import { useState } from "react";
import { toast } from "@/components/ProMessage";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import { getChecklistTrash, restoreChecklist } from "@/db/checklistAction";
import type { ChecklistTrashItem, ChecklistTrashResult } from "@/types/checklist";

export function ChecklistTrashView({
  initial,
  query = "",
}: {
  initial: ChecklistTrashResult;
  query?: string;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const restore = async (item: ChecklistTrashItem) => {
    let result: Awaited<ReturnType<typeof restoreChecklist>>;
    try {
      result = await restoreChecklist(item.id, item.revision);
    } catch {
      const authoritative = await getChecklistTrash({ q: query });
      if (authoritative.status === "success") {
        setItems(authoritative.data.items);
        setCursor(authoritative.data.nextCursor);
      }
      toast.error("恢复结果未知，已重新读取回收站");
      return;
    }
    if (result.status !== "success") return toast.error(result.message);
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    toast.success("清单已恢复");
  };
  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const result = await getChecklistTrash({ q: query, cursor });
    if (result.status === "success") {
      setItems((current) => [
        ...new Map([...current, ...result.data.items].map((item) => [item.id, item])).values(),
      ]);
      setCursor(result.data.nextCursor);
    } else toast.error(result.message);
    setLoading(false);
  };
  if (!items.length) {
    return (
      <NeuPanel density="comfortable">
        <h2 className="text-lg font-semibold">回收站为空</h2>
        <p className="text-sm text-muted-foreground">删除的清单会在这里保留三十天。</p>
      </NeuPanel>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <NeuPanel layout="row" density="compact" className="items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold" title={item.name}>
                  {item.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  可恢复至 {new Date(item.recoverableUntil).toLocaleString()}
                </p>
              </div>
              <Button onClick={() => restore(item)}>恢复</Button>
            </NeuPanel>
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button onClick={loadMore} disabled={loading}>
          {loading ? "正在加载…" : "加载更多"}
        </Button>
      ) : null}
    </div>
  );
}
