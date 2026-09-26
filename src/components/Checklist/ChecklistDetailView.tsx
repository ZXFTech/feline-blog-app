"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChecklistItemGrid } from "@/hooks/useChecklistItemGrid";
import { ChecklistItemCard } from "@/components/Checklist/ChecklistItemCard";
import { ChecklistItemDetailDialog } from "@/components/Checklist/ChecklistItemDetailDialog";
import { ChecklistItemEditDialog } from "@/components/Checklist/ChecklistItemEditDialog";
import { ChecklistItemTrashDialog } from "@/components/Checklist/ChecklistItemTrashDialog";
import { CountdownBadge, StatusIndicator } from "@/components/Checklist/ChecklistCard";
import { toast } from "@/components/ProMessage";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { NeuPanel } from "@/components/ui/neu-panel";
import { StyledLink } from "@/components/ui/styled-link";
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
  addChecklistItem,
  getChecklistDetail,
  restoreChecklist,
  restoreChecklistItem,
  restoreChecklistItems,
  softDeleteChecklist,
  softDeleteChecklistItem,
  softDeleteChecklistItems,
  toggleChecklistItem,
  updateChecklistItemDetail,
} from "@/db/checklistAction";
import type { ChecklistItem } from "@/lib/checklist";
import type { ChecklistDetail } from "@/types/checklist";

type ChecklistItemFilter = "all" | "completed" | "incomplete";

const ITEM_FILTERS: ReadonlyArray<{ value: ChecklistItemFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已完成" },
  { value: "incomplete", label: "未完成" },
];

function applyAuthoritativeConfirmation(
  source: ChecklistDetail,
  itemId: string,
  confirmedAt: string | null,
  itemRevision: number,
  parentRevision: number,
  serverNow: string
): ChecklistDetail {
  const items = source.items.map((item) =>
    item.id === itemId ? { ...item, confirmedAt, revision: itemRevision } : item
  );
  const confirmedCount = items.filter((item) => item.confirmedAt !== null).length;
  const confirmationState =
    confirmedCount === items.length
      ? "confirmed"
      : confirmedCount === 0
        ? "unconfirmed"
        : "partial";

  return {
    ...source,
    revision: parentRevision,
    serverNow,
    items,
    confirmedCount,
    confirmationState,
  };
}

export function ChecklistDetailView({ initial }: { initial: ChecklistDetail }) {
  const router = useRouter();
  const queue = useRef(Promise.resolve());
  const lastToggleAt = useRef(new Map<string, number>());
  const serverDetail = useRef(initial);
  const editTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const toggleTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const filterTriggerRefs = useRef(new Map<ChecklistItemFilter, HTMLButtonElement>());
  const checklistId = useRef(initial.id);
  const [detail, setDetail] = useState(initial);
  const [itemFilter, setItemFilter] = useState<ChecklistItemFilter>("all");
  const [detailItem, setDetailItem] = useState<ChecklistItem | null>(null);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [newItemId, setNewItemId] = useState<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const batchTrigger = useRef<HTMLButtonElement>(null);
  const itemList = useRef<HTMLDivElement>(null);
  const [deleteList, setDeleteList] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ChecklistItem | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [pendingCompletion, setPendingCompletion] = useState<Map<string, boolean>>(new Map());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const cards: ChecklistItem[] = detail.items.map((item) => ({
    id: item.id,
    label: item.detail,
    done: pendingCompletion.get(item.id) ?? Boolean(item.confirmedAt),
    revision: item.revision,
    createdOrder: item.createdOrder,
  }));
  const done = cards.filter((item) => item.done).length;
  const filteredCards = cards.filter((item) => {
    if (itemFilter === "completed") return item.done;
    if (itemFilter === "incomplete") return !item.done;
    return true;
  });
  const itemGrid = useChecklistItemGrid<HTMLDivElement>(filteredCards.length);
  const visibleItemKey = filteredCards.map((item) => item.id).join("\u0000");

  const undoToast = (undoVisibleUntil: string, serverNow: string) =>
    Math.max(0, new Date(undoVisibleUntil).getTime() - new Date(serverNow).getTime());

  const reconcileDetail = async () => {
    const latest = await getChecklistDetail(detail.id);
    if (latest.status === "success") {
      serverDetail.current = latest.data;
      setDetail(latest.data);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const changedChecklist = checklistId.current !== initial.id;
    checklistId.current = initial.id;
    serverDetail.current = initial;
    setDetail(initial);
    if (changedChecklist) {
      setItemFilter("all");
      setSelected(new Set());
      setBatchMode(false);
      setPendingCompletion(new Map());
      setStatusMessage(null);
    }
  }, [initial]);

  useEffect(() => {
    const visible = new Set(visibleItemKey ? visibleItemKey.split("\u0000") : []);
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [visibleItemKey]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refreshVisible);
    return () => document.removeEventListener("visibilitychange", refreshVisible);
  }, [router]);

  const toggleSelection = (item: ChecklistItem) => {
    if (!selected.has(item.id) && selected.size >= 100) {
      toast.error("单次最多选择 100 个项目");
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const toggle = (item: ChecklistItem) => {
    const now = performance.now();
    if (
      pendingCompletion.has(item.id) ||
      now - (lastToggleAt.current.get(item.id) ?? -Infinity) < 600
    )
      return;
    lastToggleAt.current.set(item.id, now);
    const target = !item.done;
    const leavesCurrentFilter =
      (itemFilter === "completed" && !target) || (itemFilter === "incomplete" && target);
    const itemIndex = filteredCards.findIndex((candidate) => candidate.id === item.id);
    const focusTargetId =
      filteredCards[itemIndex + 1]?.id ?? filteredCards[itemIndex - 1]?.id ?? null;
    const moveFocus = leavesCurrentFilter;

    setStatusMessage(null);
    setPendingCompletion((current) => new Map(current).set(item.id, target));
    if (moveFocus) {
      requestAnimationFrame(() => {
        (focusTargetId
          ? toggleTriggerRefs.current.get(focusTargetId)
          : filterTriggerRefs.current.get(itemFilter)
        )?.focus();
      });
    }
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        let succeeded = false;
        try {
          const authoritative = serverDetail.current;
          const currentItem = authoritative.items.find((candidate) => candidate.id === item.id);
          if (!currentItem) return;
          const result = await toggleChecklistItem({
            checklistId: authoritative.id,
            itemId: item.id,
            confirmed: target,
            itemRevision: currentItem.revision,
            parentRevision: authoritative.revision,
          });
          if (result.status !== "success") {
            toast.error(`${result.message}，请刷新后重试`);
            return;
          }
          succeeded = true;
          serverDetail.current = applyAuthoritativeConfirmation(
            serverDetail.current,
            item.id,
            result.data.confirmedAt,
            result.data.itemRevision,
            result.data.parentRevision,
            result.data.serverNow
          );
          setDetail((current) =>
            applyAuthoritativeConfirmation(
              current,
              item.id,
              result.data.confirmedAt,
              result.data.itemRevision,
              result.data.parentRevision,
              result.data.serverNow
            )
          );
          if (moveFocus) {
            setStatusMessage(`“${item.label}”已标记为${target ? "已完成" : "未完成"}`);
          }
        } catch {
          await reconcileDetail();
          toast.error("确认结果未知，已重新读取清单，请核对后重试");
        } finally {
          setPendingCompletion((current) => {
            const next = new Map(current);
            next.delete(item.id);
            return next;
          });
          if (moveFocus && !succeeded) {
            requestAnimationFrame(() => toggleTriggerRefs.current.get(item.id)?.focus());
          }
        }
      });
  };

  const removeList = async () => {
    setDeleteList(false);
    let result: Awaited<ReturnType<typeof softDeleteChecklist>>;
    try {
      result = await softDeleteChecklist(detail.id, detail.revision);
    } catch {
      const stillActive = await reconcileDetail();
      if (!stillActive) {
        router.push("/checklists");
        router.refresh();
      }
      toast.error("删除结果未知，已重新读取清单状态");
      return;
    }
    if (result.status !== "success") return toast.error(result.message);
    toast.success("清单已移入回收站", {
      duration: undoToast(result.data.undoVisibleUntil, result.data.serverNow),
      action: {
        label: "撤销",
        onClick: async () => {
          try {
            const restored = await restoreChecklist(detail.id, result.data.revision);
            if (restored.status === "success") router.refresh();
            else toast.error(restored.message);
          } catch {
            router.refresh();
            toast.error("恢复结果未知，正在重新读取清单");
          }
        },
      },
    });
    router.push("/checklists");
    router.refresh();
  };

  const removeItem = async () => {
    if (!deleteItem) return;
    const target = deleteItem;
    const targetIndex = detail.items.findIndex((item) => item.id === target.id);
    setDeleteItem(null);
    let result: Awaited<ReturnType<typeof softDeleteChecklistItem>>;
    try {
      result = await softDeleteChecklistItem({
        checklistId: detail.id,
        itemId: target.id,
        itemRevision: target.revision!,
        parentRevision: detail.revision,
      });
    } catch {
      await reconcileDetail();
      toast.error("删除结果未知，已重新读取清单，请核对后重试");
      return;
    }
    if (result.status !== "success") return toast.error(result.message);
    setDetail((current) => {
      const next = {
        ...current,
        revision: result.data.parentRevision,
        serverNow: result.data.serverNow,
        itemCount: current.itemCount - 1,
        confirmedCount: current.confirmedCount - (target.done ? 1 : 0),
        items: current.items.filter((item) => item.id !== target.id),
      };
      serverDetail.current = next;
      return next;
    });
    setSelected((current) => {
      const next = new Set(current);
      next.delete(target.id);
      return next;
    });
    requestAnimationFrame(() => {
      const remaining = serverDetail.current.items;
      const nextId = remaining[Math.min(targetIndex, remaining.length - 1)]?.id;
      (nextId ? editTriggerRefs.current.get(nextId) : batchTrigger.current)?.focus();
    });
    toast.success("项目已移入回收站", {
      duration: undoToast(result.data.undoVisibleUntil, result.data.serverNow),
      action: {
        label: "撤销",
        onClick: async () => {
          try {
            const restored = await restoreChecklistItem({
              checklistId: detail.id,
              itemId: result.data.id,
              itemRevision: result.data.itemRevision,
              parentRevision: result.data.parentRevision,
            });
            if (restored.status === "success") router.refresh();
            else toast.error(restored.message);
          } catch {
            await reconcileDetail();
            toast.error("恢复结果未知，已重新读取清单");
          }
        },
      },
    });
  };

  const removeSelectedItems = async () => {
    setBatchDeleteOpen(false);
    const targets = filteredCards.filter((item) => selected.has(item.id));
    if (!targets.length) return;
    let result: Awaited<ReturnType<typeof softDeleteChecklistItems>>;
    try {
      result = await softDeleteChecklistItems({
        checklistId: detail.id,
        parentRevision: detail.revision,
        items: targets.map((item) => ({ itemId: item.id, itemRevision: item.revision! })),
      });
    } catch {
      await reconcileDetail();
      toast.error("删除结果未知，已重新读取清单，请核对后重试");
      return;
    }
    if (result.status !== "success") return toast.error(result.message);
    const removed = new Set(result.data.items.map((item) => item.itemId));
    const nextDetail = {
      ...detail,
      revision: result.data.parentRevision,
      serverNow: result.data.serverNow,
      itemCount: detail.itemCount - removed.size,
      confirmedCount: detail.confirmedCount - targets.filter((item) => item.done).length,
      items: detail.items.filter((item) => !removed.has(item.id)),
    };
    serverDetail.current = nextDetail;
    setDetail(nextDetail);
    setSelected(new Set());
    setBatchMode(false);
    toast.success(`已删除 ${removed.size} 个项目`, {
      duration: undoToast(result.data.undoVisibleUntil, result.data.serverNow),
      action: {
        label: "撤销",
        onClick: async () => {
          try {
            const restored = await restoreChecklistItems({
              checklistId: detail.id,
              items: result.data.items,
              parentRevision: result.data.parentRevision,
            });
            if (restored.status === "success") router.refresh();
            else toast.error(restored.message);
          } catch {
            await reconcileDetail();
            toast.error("恢复结果未知，已重新读取清单");
          }
        },
      },
    });
  };

  const saveItemDetail = async (nextDetail: string) => {
    if (!editItem?.revision) throw new Error("清单项目版本无效，请刷新后重试");
    let result: Awaited<ReturnType<typeof updateChecklistItemDetail>>;
    try {
      result = await updateChecklistItemDetail({
        checklistId: detail.id,
        itemId: editItem.id,
        detail: nextDetail,
        itemRevision: editItem.revision,
        parentRevision: detail.revision,
      });
    } catch {
      await reconcileDetail();
      throw new Error("保存结果未知，已重新读取清单，请核对后重试");
    }
    if (!result) throw new Error("暂时无法更新清单项目");
    if (result.status !== "success") throw new Error(result.message);
    const next = {
      ...detail,
      revision: result.data.parentRevision,
      serverNow: result.data.serverNow,
      items: detail.items.map((item) =>
        item.id === editItem.id
          ? { ...item, detail: result.data.detail, revision: result.data.itemRevision }
          : item
      ),
    };
    serverDetail.current = next;
    setDetail(next);
    toast.success("清单项目已更新");
  };

  const closeItemEditor = () => {
    if (!editItem) return;
    const id = editItem.id;
    setEditItem(null);
    requestAnimationFrame(() => editTriggerRefs.current.get(id)?.focus());
  };

  const addItem = async (text: string) => {
    if (!newItemId) return;
    const task = queue.current
      .catch(() => undefined)
      .then(async () => {
        let result: Awaited<ReturnType<typeof addChecklistItem>>;
        try {
          result = await addChecklistItem({
            checklistId: detail.id,
            itemId: newItemId,
            detail: text,
            parentRevision: serverDetail.current.revision,
          });
        } catch {
          throw new Error("新增结果未知，请重试以核对并完成本次新增");
        }
        if (result.status !== "success") throw new Error(result.message);
        serverDetail.current = result.data;
        setDetail(result.data);
        if (itemList.current) itemList.current.scrollTop = 0;
        toast.success("清单项已添加");
      });
    queue.current = task.catch(() => undefined);
    await task;
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <NeuPanel density="comfortable" className="shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusIndicator done={done} total={detail.items.length} size={16} />
            <h1 className="text-2xl font-bold leading-none text-balance">{detail.name}</h1>
          </div>
          <CountdownBadge
            expiresAt={new Date(detail.expiresAt).getTime()}
            textClass="text-sm"
            serverNow={new Date(detail.serverNow).getTime()}
          />
        </div>
      </NeuPanel>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          已确认 {done} 项，共 {detail.items.length} 项
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <StyledLink href="/checklists">返回清单列表</StyledLink>
          <Button onClick={() => setTrashOpen(true)}>已删除项目</Button>
          <StyledLink href={`/checklists/${detail.id}/edit`}>编辑清单</StyledLink>
          <Button variant="danger" onClick={() => setDeleteList(true)}>
            删除清单
          </Button>
        </div>
      </div>
      <section
        aria-labelledby="checklist-items-title"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 id="checklist-items-title" className="text-lg font-semibold">
            确认项目
          </h2>
          <div className="flex flex-wrap justify-end gap-2">
            {batchMode && selected.size ? (
              <Button variant="danger" onClick={() => setBatchDeleteOpen(true)}>
                删除 {selected.size} 项
              </Button>
            ) : null}
            <ButtonGroup aria-label="清单项完成状态筛选">
              {ITEM_FILTERS.map((filter) => (
                <Button
                  ref={(node) => {
                    if (node) filterTriggerRefs.current.set(filter.value, node);
                    else filterTriggerRefs.current.delete(filter.value);
                  }}
                  key={filter.value}
                  type="button"
                  variant={itemFilter === filter.value ? "primary" : "default"}
                  aria-pressed={itemFilter === filter.value}
                  onClick={() => {
                    if (itemFilter === filter.value) return;
                    setItemFilter(filter.value);
                    setSelected(new Set());
                    setStatusMessage(null);
                  }}
                >
                  {filter.label}
                </Button>
              ))}
            </ButtonGroup>
            <Button
              ref={addTrigger}
              disabled={detail.items.length >= 200}
              onClick={() => setNewItemId(crypto.randomUUID())}
            >
              新增清单项
            </Button>
            <Button
              ref={batchTrigger}
              variant={batchMode ? "primary" : "default"}
              onClick={() => {
                setBatchMode((current) => !current);
                setSelected(new Set());
              }}
            >
              {batchMode ? "退出批量管理" : "批量管理"}
            </Button>
          </div>
        </div>
        <div
          ref={itemList}
          data-testid="checklist-item-scroll"
          className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-[var(--spacing-panel-inset-default)]"
        >
          {filteredCards.length === 0 ? (
            <p role="status" className="py-6 text-center text-sm text-muted-foreground">
              {statusMessage ? `${statusMessage}。` : null}
              {itemFilter === "completed" ? "没有已完成的清单项" : "没有未完成的清单项"}
            </p>
          ) : statusMessage ? (
            <p role="status" className="sr-only">
              {statusMessage}
            </p>
          ) : null}
          <div className="checklist-item-grid" {...itemGrid}>
            {filteredCards.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                size="md"
                onToggle={toggle}
                onOpenDetail={setDetailItem}
                onEdit={setEditItem}
                onDelete={setDeleteItem}
                editButtonRef={(node) => {
                  if (node) editTriggerRefs.current.set(item.id, node);
                  else editTriggerRefs.current.delete(item.id);
                }}
                toggleButtonRef={(node) => {
                  if (node) toggleTriggerRefs.current.set(item.id, node);
                  else toggleTriggerRefs.current.delete(item.id);
                }}
                selectionMode={batchMode}
                showActions={batchMode}
                selected={selected.has(item.id)}
                onSelect={toggleSelection}
                loading={pendingCompletion.has(item.id)}
              />
            ))}
          </div>
        </div>
      </section>
      {newItemId ? (
        <ChecklistItemEditDialog
          open
          mode="create"
          detail=""
          description="填写清单项详情，确认后保存至当前清单。"
          onSave={addItem}
          onOpenChange={(open) => {
            if (!open) {
              setNewItemId(null);
              requestAnimationFrame(() => addTrigger.current?.focus());
            }
          }}
        />
      ) : null}
      {detailItem ? (
        <ChecklistItemDetailDialog
          open
          item={detailItem}
          onOpenChange={(open) => !open && setDetailItem(null)}
        />
      ) : null}
      {editItem ? (
        <ChecklistItemEditDialog
          open
          detail={editItem.label}
          onOpenChange={(open) => {
            if (!open) closeItemEditor();
          }}
          onSave={saveItemDetail}
        />
      ) : null}
      <ChecklistItemTrashDialog
        checklistId={detail.id}
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onRestored={() => {
          setTrashOpen(false);
          router.refresh();
        }}
      />
      <AlertDialog open={deleteList} onOpenChange={setDeleteList}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这份清单？</AlertDialogTitle>
            <AlertDialogDescription>清单会进入回收站，并保留三十天。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={removeList}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deleteItem)} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个项目？</AlertDialogTitle>
            <AlertDialogDescription>
              项目会进入这份清单的回收站。清单必须至少保留一个有效项目。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={removeItem}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除选中的项目？</AlertDialogTitle>
            <AlertDialogDescription>
              将 {selected.size} 个项目移入回收站。清单必须至少保留一个有效项目。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={removeSelectedItems}>
              确认批量删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
