"use client";

import { useRef, type Ref } from "react";
import {
  Check,
  createLucideIcon,
  Info,
  Loader2,
  Pencil,
  SquareCheckBig,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";
import type { ChecklistItem } from "@/lib/checklist";

export type ChecklistItemCardSize = "lg" | "md" | "sm";

const SquareExclamationPoint = createLucideIcon("SquareExclamationPoint", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "square" }],
  ["path", { d: "M12 8v4", key: "line" }],
  ["path", { d: "M12 16h.01", key: "dot" }],
]);

/** 各尺寸度量值，与 ChecklistCard 保持一致 */
const SIZE_CONFIG = {
  lg: {
    pad: "p-[var(--spacing-card-pad-lg)]",
    gap: "gap-2",
    status: "size-5",
    title: "line-clamp-6 text-sm font-semibold leading-5",
    detail: "line-clamp-3 text-body-base leading-5",
  },
  md: {
    pad: "p-[var(--spacing-card-pad-md)]",
    gap: "gap-1",
    status: "size-4",
    title: "line-clamp-5 text-xs font-semibold leading-4",
    detail: "line-clamp-2 text-[10px] leading-4",
  },
  sm: {
    pad: "p-[var(--spacing-card-pad-sm)]",
    gap: "gap-0.5",
    status: "size-3",
    title: "line-clamp-3 text-[10px] font-semibold leading-3",
    detail: "line-clamp-2 text-[8px] leading-3",
  },
} as const;

/** 左上角状态图标：已确认=绿色对钩，未确认=黄色感叹号 */
function StatusIcon({ done, className }: { done: boolean; className: string }) {
  if (done) {
    return (
      <SquareCheckBig
        className={className}
        style={{ color: "var(--status-success)" }}
        strokeWidth={2}
        role="img"
        aria-label="已确认"
      />
    );
  }
  return (
    <SquareExclamationPoint
      strokeWidth={2}
      className={className}
      style={{ color: "var(--status-warning)" }}
      role="img"
      aria-label="未确认"
    />
  );
}

const TOGGLE_THROTTLE = 600;
export interface ChecklistItemCardProps {
  item: ChecklistItem;
  size?: ChecklistItemCardSize;
  layout?: "card" | "list";
  onToggle?: (item: ChecklistItem) => void;
  onOpenDetail?: (item: ChecklistItem) => void;
  onEdit?: (item: ChecklistItem) => void;
  onDelete?: (item: ChecklistItem) => void;
  selectionMode?: boolean;
  showActions?: boolean;
  selected?: boolean;
  onSelect?: (item: ChecklistItem) => void;
  loading?: boolean;
  draftMode?: boolean;
  editButtonRef?: Ref<HTMLButtonElement>;
  toggleButtonRef?: Ref<HTMLButtonElement>;
}

export function ChecklistItemCard({
  item,
  size = "lg",
  layout = "card",
  onToggle,
  onOpenDetail,
  onEdit,
  onDelete,
  selectionMode = false,
  showActions = false,
  selected = false,
  onSelect,
  loading = false,
  draftMode = false,
  editButtonRef,
  toggleButtonRef,
}: ChecklistItemCardProps) {
  const c = SIZE_CONFIG[size];
  const lastToggle = useRef(0);

  // 点击切换状态，0.6s 节流防误触
  const toggle = () => {
    if (loading) return;
    if (selectionMode) {
      onSelect?.(item);
      return;
    }
    const nowTs = Date.now();
    if (nowTs - lastToggle.current < TOGGLE_THROTTLE) return;
    lastToggle.current = nowTs;
    onToggle?.(item);
  };

  return (
    <NeuSurface
      radius="xl"
      aria-busy={loading}
      style={
        layout === "list"
          ? {
              width: "100%",
              height: size === "lg" ? 96 : size === "md" ? 80 : 64,
            }
          : { width: "100%" }
      }
      className={cn(
        "relative flex min-h-0 min-w-0 select-none flex-col overflow-hidden",
        layout === "card" && "aspect-square max-h-[12.5rem] max-w-[12.5rem]",
        layout === "card" ? c.pad : "px-4 py-2",
        layout === "card" ? c.gap : "gap-3",
        "transition-colors hover:bg-muted"
      )}
    >
      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
        {selectionMode ? (
          <span
            aria-hidden
            className={cn(
              "inline-flex items-center justify-center rounded border border-border bg-background",
              c.status,
              selected && "border-primary bg-primary text-primary-foreground"
            )}
          >
            {selected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        ) : (
          <StatusIcon done={item.done} className={c.status} />
        )}
        {onOpenDetail && !draftMode ? (
          <Button
            type="button"
            size="icon"
            disabled={loading}
            aria-label="查看清单项详情"
            className={cn("pointer-events-auto", selectionMode && "invisible")}
            onClick={() => onOpenDetail(item)}
          >
            <Info aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {!draftMode ? (
          <Button
            ref={toggleButtonRef}
            type="button"
            disabled={loading}
            aria-pressed={selectionMode ? selected : item.done}
            aria-label={
              selectionMode
                ? `${selected ? "取消选择" : "选择"}清单项：${item.label}`
                : `切换清单项状态：${item.label}`
            }
            onClick={toggle}
            className="absolute inset-0 z-10 h-auto w-auto rounded-none bg-transparent p-0 shadow-none hover:bg-transparent active:scale-100 active:bg-transparent active:shadow-none"
          />
        ) : null}
        <div className="pointer-events-none flex min-h-0 w-full flex-col overflow-hidden text-left">
          <h3
            title={item.label}
            className={cn(
              "min-w-0 whitespace-normal text-foreground text-pretty",
              layout === "card" ? c.title : "line-clamp-2 text-sm font-semibold"
            )}
          >
            {item.label}
          </h3>
          {item.detail ? (
            <p
              className={cn(
                "mt-1 min-w-0 whitespace-normal text-muted-foreground",
                layout === "card" ? c.detail : "line-clamp-1 text-xs"
              )}
            >
              {item.detail}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "pointer-events-auto relative z-10 mt-auto flex min-h-[1.8125rem] w-full shrink-0 items-center justify-between gap-2"
        )}
      >
        {showActions && onDelete ? (
          <Button
            type="button"
            size="icon"
            variant="danger"
            disabled={loading}
            aria-label="删除清单项"
            onClick={() => onDelete(item)}
          >
            <Trash2 />
          </Button>
        ) : (
          <span aria-hidden />
        )}

        {showActions && onEdit ? (
          <Button
            ref={editButtonRef}
            type="button"
            size="icon"
            variant="primary"
            disabled={loading}
            aria-label="编辑清单项"
            onClick={() => onEdit(item)}
          >
            <Pencil />
          </Button>
        ) : null}
      </div>
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 bg-background/85 text-xs font-medium text-muted-foreground backdrop-blur-xs"
        >
          <Loader2
            className="size-5 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
          <span>更新中</span>
        </div>
      ) : null}
    </NeuSurface>
  );
}
