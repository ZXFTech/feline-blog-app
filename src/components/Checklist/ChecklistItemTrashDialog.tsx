"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ProMessage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NeuPanel } from "@/components/ui/neu-panel";
import { getChecklistItemTrash, restoreChecklistItem } from "@/db/checklistAction";
import type { ChecklistItemTrashItem } from "@/types/checklist";

interface ChecklistItemTrashDialogProps {
  checklistId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}

export function ChecklistItemTrashDialog({
  checklistId,
  open,
  onOpenChange,
  onRestored,
}: ChecklistItemTrashDialogProps) {
  const [items, setItems] = useState<ChecklistItemTrashItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const result = await getChecklistItemTrash(checklistId);
    if (result.status === "success") {
      setItems(result.data.items);
      setCursor(result.data.nextCursor);
    } else setError(result.message);
    setLoading(false);
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const result = await getChecklistItemTrash(checklistId, { cursor });
    if (result.status === "success") {
      setItems((current) => [
        ...new Map([...current, ...result.data.items].map((item) => [item.id, item])).values(),
      ]);
      setCursor(result.data.nextCursor);
    } else setError(result.message);
    setLoading(false);
  };

  useEffect(() => {
    if (open) void load();
    // Opening the dialog defines a new owner scoped query generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, checklistId]);

  const restore = async (item: ChecklistItemTrashItem) => {
    let result: Awaited<ReturnType<typeof restoreChecklistItem>>;
    try {
      result = await restoreChecklistItem({
        checklistId,
        itemId: item.id,
        itemRevision: item.revision,
        parentRevision: item.parentRevision,
      });
    } catch {
      await load();
      toast.error("恢复结果未知，已重新读取已删除项目");
      return;
    }
    if (result.status !== "success") {
      toast.error(result.message);
      return;
    }
    setItems((current) =>
      current
        .filter((candidate) => candidate.id !== item.id)
        .map((candidate) => ({ ...candidate, parentRevision: result.data.parentRevision }))
    );
    toast.success("清单项目已恢复");
    onRestored();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="display"
        className="flex max-h-[calc(100svh-2rem)] max-w-2xl flex-col overflow-hidden"
      >
        <div>
          <DialogTitle>已删除项目</DialogTitle>
          <DialogDescription>这里只显示当前清单在三十天恢复期内单独删除的项目。</DialogDescription>
        </div>
        <div
          data-testid="checklist-trash-scroll"
          className="no-scrollbar min-h-0 overflow-y-auto p-[var(--spacing-panel-inset-default)]"
        >
          {loading ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              正在读取已删除项目…
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="flex items-center gap-3 py-4 text-sm text-destructive">
              <span>{error}</span>
              <Button size="sm" onClick={load}>
                重试
              </Button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">这份清单没有可恢复的项目。</p>
          ) : null}
          {!loading && !error && items.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id}>
                  <NeuPanel
                    layout="row"
                    density="compact"
                    className="items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={item.detail}>
                        {item.detail}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        删除于 {new Date(item.deletedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button onClick={() => restore(item)}>恢复</Button>
                  </NeuPanel>
                </li>
              ))}
            </ul>
          ) : null}
          {!error && cursor ? (
            <Button onClick={loadMore} disabled={loading}>
              {loading ? "正在加载…" : "加载更多"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
