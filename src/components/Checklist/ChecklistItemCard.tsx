"use client";

import { useEffect, useRef } from "react";
import { Check, CircleAlert, Info, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeuSurface } from "@/components/ui/neu-surface";
import type { ChecklistItem } from "@/lib/checklist";

export type ChecklistItemCardSize = "lg" | "md" | "sm";

/** 各尺寸度量值，与 ChecklistCard 保持一致 */
const SIZE_CONFIG = {
  lg: {
    width: 256,
    height: 240,
    pad: "p-[var(--spacing-card-pad-lg)]",
    gap: "gap-2",
    status: "size-5",
    hint: "text-[11px]",
    title: "line-clamp-1 text-sm font-semibold leading-5",
    detail: "text-body-base leading-5",
    button: "size-8",
    buttonIcon: "size-4",
  },
  md: {
    width: 192,
    height: 180,
    pad: "p-[var(--spacing-card-pad-md)]",
    gap: "gap-1",
    status: "size-4",
    hint: "text-[9px]",
    title: "line-clamp-1 text-xs font-semibold leading-4",
    detail: "text-[10px] leading-4",
    button: "size-6",
    buttonIcon: "size-3.5",
  },
  sm: {
    width: 128,
    height: 120,
    pad: "p-[var(--spacing-card-pad-sm)]",
    gap: "gap-0.5",
    status: "size-3",
    hint: "text-[7px]",
    title: "line-clamp-1 text-[10px] font-semibold leading-3",
    detail: "text-[8px] leading-3",
    button: "size-4",
    buttonIcon: "size-2.5",
  },
} as const;

/** 左上角状态图标：已确认=绿色对钩，未确认=黄色感叹号 */
function StatusIcon({ done, className }: { done: boolean; className: string }) {
  if (done) {
    return (
      <Check
        className={className}
        style={{ color: "var(--status-success)" }}
        strokeWidth={3}
        role="img"
        aria-label="已确认"
      />
    );
  }
  return (
    <CircleAlert
      className={className}
      style={{ color: "var(--status-warning)" }}
      role="img"
      aria-label="未确认"
    />
  );
}

const TOGGLE_THROTTLE = 600;
const LONG_PRESS_MS = 500;

export interface ChecklistItemCardProps {
  item: ChecklistItem;
  size?: ChecklistItemCardSize;
  onToggle?: (item: ChecklistItem) => void;
  onOpenDetail?: (item: ChecklistItem) => void;
  onEdit?: (item: ChecklistItem) => void;
  onDelete?: (item: ChecklistItem) => void;
}

export function ChecklistItemCard({
  item,
  size = "lg",
  onToggle,
  onOpenDetail,
  onEdit,
  onDelete,
}: ChecklistItemCardProps) {
  const c = SIZE_CONFIG[size];
  const lastToggle = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

  // 点击切换状态，0.6s 节流防误触
  const toggle = () => {
    const nowTs = Date.now();
    if (nowTs - lastToggle.current < TOGGLE_THROTTLE) return;
    lastToggle.current = nowTs;
    onToggle?.(item);
  };

  const startPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    longPressed.current = false;
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onOpenDetail?.(item);
    }, LONG_PRESS_MS);
  };

  const clearPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pointerOrigin.current = null;
  };

  useEffect(() => clearPress, []);

  return (
    <NeuSurface
      radius="xl"
      style={{ width: c.width, height: c.height }}
      className={cn(
        "relative flex select-none flex-col overflow-hidden",
        c.pad,
        c.gap,
        "transition-colors hover:bg-muted"
      )}
    >
      <button
        type="button"
        aria-pressed={item.done}
        aria-label={`切换清单项状态：${item.label}`}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          toggle();
        }}
        onPointerDown={startPress}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        onPointerMove={(event) => {
          const origin = pointerOrigin.current;
          if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8)
            clearPress();
        }}
        className="absolute inset-0 z-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative z-10 contents">
        {/* 第一行：状态（左） + 详情提示（右） */}
        <div className="pointer-events-auto flex items-center justify-between">
          <StatusIcon done={item.done} className={c.status} />
          <span className={cn("leading-none text-muted-foreground", c.hint)}>长按查看详情</span>
        </div>

        {/* 第二行：清单项名称（单行省略号） */}
        <h3 className={cn("text-foreground text-pretty", c.title)}>{item.label}</h3>

        {/* 第三行：清单项详情（小字号，撑满剩余空间后省略号） */}
        <p className={cn("flex-1 overflow-hidden text-muted-foreground", c.detail)}>
          {item.detail}
        </p>

        {/* 第四行：操作区 — 删除（左） + 编辑（右），复用清单卡片按钮 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="删除清单项"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(item);
            }}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center rounded-md bg-background outline-none",
              "shadow-neu-raised-sm transition-shadow active:shadow-neu-inset-sm",
              "focus-visible:ring-2 focus-visible:ring-ring",
              c.button
            )}
            style={{ color: "var(--destructive)" }}
          >
            <Trash2 className={c.buttonIcon} />
          </button>

          <button
            type="button"
            aria-label="查看清单项详情"
            onClick={() => onOpenDetail?.(item)}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center rounded-md bg-background outline-none",
              "shadow-neu-raised-sm transition-shadow active:shadow-neu-inset-sm",
              "focus-visible:ring-2 focus-visible:ring-ring",
              c.button
            )}
          >
            <Info className={c.buttonIcon} />
          </button>

          <button
            type="button"
            aria-label="编辑清单项"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(item);
            }}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center rounded-md bg-background outline-none",
              "shadow-neu-raised-sm transition-shadow active:shadow-neu-inset-sm",
              "focus-visible:ring-2 focus-visible:ring-ring",
              c.button
            )}
            style={{ color: "var(--primary)" }}
          >
            <Pencil className={c.buttonIcon} />
          </button>
        </div>
      </div>
    </NeuSurface>
  );
}
