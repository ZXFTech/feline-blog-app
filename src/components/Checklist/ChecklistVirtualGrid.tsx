"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Virtuoso, VirtuosoGrid } from "react-virtuoso";
import { Trash2 } from "lucide-react";
import { ChecklistCard } from "@/components/Checklist/ChecklistCard";
import { toast } from "@/components/ProMessage";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  restoreChecklist,
  restoreChecklists,
  softDeleteChecklist,
  softDeleteChecklists,
} from "@/db/checklistAction";
import type { Checklist } from "@/lib/checklist";
import type { ChecklistListItem, ChecklistListResult } from "@/types/checklist";

interface ChecklistVirtualGridProps {
  initial: ChecklistListResult;
  query: { expiry: string; confirmation: string; q: string };
}

function asCard(row: ChecklistListItem): Checklist {
  return {
    id: row.id,
    name: row.name,
    themeColor: row.themeColor,
    expiresAt: new Date(row.expiresAt).getTime(),
    revision: row.revision,
    items: Array.from({ length: row.itemCount }, (_, index) => ({
      id: `${row.id}-${index}`,
      label: "",
      done: index < row.confirmedCount,
    })),
  };
}

export function ChecklistVirtualGrid({ initial, query }: ChecklistVirtualGridProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [width, setWidth] = useState(0);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<ChecklistListItem[]>([]);
  const undoToast = (undoVisibleUntil: string, serverNow: string) =>
    Math.max(0, new Date(undoVisibleUntil).getTime() - new Date(serverNow).getTime());

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    generation.current += 1;
    setItems(initial.items);
    setCursor(initial.nextCursor);
    setSelected(new Set());
    setLoadError("");
  }, [initial]);

  useEffect(() => {
    if (query.expiry !== "active" || !items.length) return;
    const serverBase = new Date(initial.serverNow).getTime();
    const receivedAt = performance.now();
    const nextExpiry = Math.min(...items.map((item) => new Date(item.expiresAt).getTime()));
    const delay = Math.max(0, nextExpiry - serverBase - (performance.now() - receivedAt));
    const timer = setTimeout(() => router.refresh(), Math.min(delay + 250, 2_147_000_000));
    const refreshVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [initial.serverNow, items, query.expiry, router]);

  const layout = width >= 1088 ? "card" : "list";
  const size = width >= 1400 ? "lg" : width >= 640 ? "md" : "sm";
  const cards = useMemo(() => items.map(asCard), [items]);

  const loadMore = async () => {
    if (!cursor || loading) return;
    const ownGeneration = generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ ...query, cursor });
      const response = await fetch(`/api/checklists?${params}`);
      const body = (await response.json()) as {
        error: boolean;
        message: string;
        data: ChecklistListResult | null;
      };
      if (!response.ok || !body.data) throw new Error(body.message || "加载失败");
      if (generation.current !== ownGeneration) return;
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of body.data!.items) byId.set(item.id, item);
        return [...byId.values()];
      });
      setCursor(body.data.nextCursor);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const open = (row: ChecklistListItem) => {
    if (batchMode) toggleSelection(row.id);
    else router.push(`/checklists/${row.id}`);
  };

  const deleteConfirmed = async () => {
    const targets = deleteTargets;
    setDeleteTargets([]);
    try {
      if (targets.length === 1) {
        const result = await softDeleteChecklist(targets[0].id, targets[0].revision);
        if (result.status !== "success") {
          toast.error(result.message);
          return;
        }
        toast.success("清单已移入回收站", {
          duration: undoToast(result.data.undoVisibleUntil, result.data.serverNow),
          action: {
            label: "撤销",
            onClick: async () => {
              try {
                const restored = await restoreChecklist(targets[0].id, result.data.revision);
                if (restored.status === "success") router.refresh();
                else toast.error(restored.message);
              } catch {
                router.refresh();
                toast.error("恢复结果未知，正在重新读取清单列表");
              }
            },
          },
        });
      } else {
        const result = await softDeleteChecklists(
          targets.map(({ id, revision }) => ({ id, revision }))
        );
        if (result.status !== "success") {
          toast.error(result.message);
          return;
        }
        toast.success(`已删除 ${targets.length} 份清单`, {
          duration: undoToast(result.data.undoVisibleUntil, result.data.serverNow),
          action: {
            label: "撤销",
            onClick: async () => {
              try {
                const restored = await restoreChecklists(result.data.items);
                if (restored.status === "success") router.refresh();
                else toast.error(restored.message);
              } catch {
                router.refresh();
                toast.error("恢复结果未知，正在重新读取清单列表");
              }
            },
          },
        });
      }
      const removed = new Set(targets.map((item) => item.id));
      setItems((current) => current.filter((item) => !removed.has(item.id)));
      setSelected(new Set());
      setBatchMode(false);
      router.refresh();
    } catch {
      toast.error("删除结果未知，正在重新读取清单列表");
      router.refresh();
    }
  };

  const itemContent = (index: number) => {
    const row = items[index];
    return (
      <div className="px-3 pb-3" role="listitem">
        <div className="relative">
          {batchMode ? (
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggleSelection(row.id)}
              aria-label={`选择清单 ${row.name}`}
              className="absolute top-2 left-2 z-20 size-5 accent-primary"
            />
          ) : null}
          <ChecklistCard
            checklist={cards[index]}
            layout={layout}
            size={size}
            onOpenDetail={() => open(row)}
            onEdit={() => router.push(`/checklists/${row.id}/edit`)}
            onDelete={() => setDeleteTargets([row])}
            serverNow={new Date(initial.serverNow).getTime()}
          />
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          {batchMode && selected.size ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteTargets(items.filter((item) => selected.has(item.id)))}
            >
              <Trash2 className="size-4" aria-hidden /> 删除 {selected.size} 项
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={batchMode ? "primary" : "default"}
            onClick={() => {
              setBatchMode((value) => !value);
              setSelected(new Set());
            }}
          >
            {batchMode ? "退出批量管理" : "批量管理"}
          </Button>
        </div>
      </div>
      <div className="min-h-[24rem] flex-1 p-[var(--spacing-panel-inset-default)]">
        {layout === "card" ? (
          <VirtuosoGrid
            style={{ height: "100%" }}
            totalCount={items.length}
            endReached={loadMore}
            itemContent={itemContent}
            components={{
              List: ({ style, children, ...props }) => (
                <div
                  {...props}
                  style={style}
                  className="flex flex-wrap content-start items-start pt-3 pb-3"
                  role="list"
                >
                  {children}
                </div>
              ),
            }}
          />
        ) : (
          <Virtuoso
            style={{ height: "100%" }}
            totalCount={items.length}
            endReached={loadMore}
            itemContent={itemContent}
            components={{
              List: ({ style, children, ...props }) => (
                <div {...props} style={style} className="pt-3 pb-3" role="list">
                  {children}
                </div>
              ),
            }}
          />
        )}
      </div>
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在加载更多清单…
        </p>
      ) : null}
      {loadError ? (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <span>{loadError}</span>
          <Button size="sm" onClick={loadMore}>
            重试
          </Button>
        </div>
      ) : null}
      <AlertDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => !open && setDeleteTargets([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除清单</AlertDialogTitle>
            <AlertDialogDescription>
              将 {deleteTargets.length} 份清单移入回收站。你可以在三十天内恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={deleteConfirmed}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
