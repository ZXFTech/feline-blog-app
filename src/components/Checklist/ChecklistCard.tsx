"use client";

import { useEffect, useState } from "react";
import { CircleAlert, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeuSurface } from "@/components/ui/neu-surface";
import {
  type Checklist,
  formatDeadline,
  getChecklistState,
  getCountdown,
  getProgress,
  ratioColor,
} from "@/lib/checklist";

export type ChecklistCardSize = "lg" | "md" | "sm";

/** 各尺寸下的度量值；md 约为 lg 的 75% */
const SIZE_CONFIG = {
  lg: {
    width: 256,
    height: 240,
    strip: "h-1.5",
    pad: "p-[var(--spacing-card-pad-lg)]",
    status: 11,
    countdown: "text-[11px]",
    countdownIcon: "size-3",
    title: "mt-3 line-clamp-2 text-sm font-semibold leading-5",
    deadline: "mt-1 text-body-base",
    totals: "text-body-base",
    actionsMt: "mt-3",
    button: "size-8",
    buttonIcon: "size-4",
  },
  md: {
    width: 192,
    height: 180,
    strip: "h-1",
    pad: "p-[var(--spacing-card-pad-md)]",
    status: 8,
    countdown: "text-[9px]",
    countdownIcon: "size-2.5",
    title: "mt-2 line-clamp-2 text-xs font-semibold leading-4",
    deadline: "mt-0.5 text-[10px]",
    totals: "text-[10px]",
    actionsMt: "mt-2",
    button: "size-6",
    buttonIcon: "size-3.5",
  },
  sm: {
    width: 128,
    height: 120,
    strip: "h-0.5",
    pad: "p-[var(--spacing-card-pad-sm)]",
    status: 6,
    countdown: "text-[7px]",
    countdownIcon: "size-2",
    title: "mt-1 line-clamp-2 text-[10px] font-semibold leading-3",
    deadline: "mt-0.5 text-[8px]",
    totals: "text-[8px]",
    actionsMt: "mt-1",
    button: "size-4",
    buttonIcon: "size-2.5",
  },
} as const;

/** 左上角状态指示：全部确认=实心绿圆，部分=扇形（面积=完成比例，橙→绿渐变），全未确认=实心灰圆 */
export function StatusIndicator({
  done,
  total,
  size,
}: {
  done: number;
  total: number;
  size: number;
}) {
  const r = size / 2;
  const state = getChecklistState(done, total);
  const ratio = total > 0 ? done / total : 0;

  if (state === "confirmed") {
    return (
      <span
        className="inline-block rounded-full"
        style={{ width: size, height: size, background: "var(--status-success)" }}
        role="img"
        aria-label={`全部确认 ${done}/${total}`}
      />
    );
  }

  if (state === "unconfirmed") {
    return (
      <span
        className="inline-block rounded-full"
        style={{ width: size, height: size, background: "var(--muted-foreground)" }}
        role="img"
        aria-label={`未确认 ${done}/${total}`}
      />
    );
  }

  // 扇形（部分确认）
  const angle = ratio * 2 * Math.PI;
  const endX = r + r * Math.sin(angle);
  const endY = r - r * Math.cos(angle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  const d = `M ${r} ${r} L ${r} 0 A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`部分确认 ${done}/${total}`}
    >
      <circle cx={r} cy={r} r={r} fill="var(--muted-foreground)" opacity={0.28} />
      <path d={d} fill={ratioColor(ratio)} />
    </svg>
  );
}

/** 右上角有效期倒计时 */
export function CountdownBadge({
  expiresAt,
  textClass,
  iconClass,
}: {
  expiresAt: number;
  textClass: string;
  iconClass: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const cd = getCountdown(expiresAt, now);

  if (cd.expired) {
    return (
      <span className={cn(textClass, "font-medium leading-none text-muted-foreground")}>
        已过期
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold leading-none", textClass)}>
      {cd.showAlert && (
        <CircleAlert className={iconClass} style={{ color: "var(--status-error)" }} aria-hidden />
      )}
      <span className="text-foreground">{cd.label}</span>
    </span>
  );
}

export interface ChecklistCardProps {
  checklist: Checklist;
  size?: ChecklistCardSize;
  onOpenDetail?: (checklist: Checklist) => void;
  onEdit?: (checklist: Checklist) => void;
  onDelete?: (checklist: Checklist) => void;
}

export function ChecklistCard({
  checklist,
  size = "lg",
  onOpenDetail,
  onEdit,
  onDelete,
}: ChecklistCardProps) {
  const { done, total } = getProgress(checklist);
  const c = SIZE_CONFIG[size];

  return (
    <NeuSurface
      radius="xl"
      style={{
        width: c.width,
        height: c.height,
        borderColor: checklist.themeColor ?? "var(--primary)",
      }}
      className={cn(
        "relative flex flex-col overflow-hidden border",
        "transition-colors hover:bg-muted"
      )}
    >
      <button
        type="button"
        aria-label={`查看清单详情：${checklist.name}`}
        onClick={() => onOpenDetail?.(checklist)}
        className="absolute inset-0 z-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {/* 顶部主题色窄条 */}
      <div
        className={cn("w-full shrink-0", c.strip)}
        style={{ background: checklist.themeColor }}
        aria-hidden
      />

      <div className={cn("pointer-events-none relative z-10 flex flex-1 flex-col", c.pad)}>
        {/* 头部：状态（左上） + 倒计时（右上） */}
        <div className="flex items-center justify-between">
          <StatusIndicator done={done} total={total} size={c.status} />
          <CountdownBadge
            expiresAt={checklist.expiresAt}
            textClass={c.countdown}
            iconClass={c.countdownIcon}
          />
        </div>

        {/* 清单名（最多两行，省略号） */}
        <h3 className={cn("text-foreground text-pretty", c.title)}>{checklist.name}</h3>

        {/* 截止日期（小字号，精确到分钟） */}
        <p className={cn("text-muted-foreground", c.deadline)}>
          截止日期: {formatDeadline(checklist.expiresAt)}
        </p>

        {/* 已完成 / 总数（纯文本，无边框无背景，与卡片底色统一） */}
        <div className={cn("mt-auto flex items-stretch", c.totals)}>
          <div className="flex flex-1 items-center justify-center gap-1 py-1.5">
            <span className="text-muted-foreground">已完成</span>
            <span className="font-semibold text-foreground">{done}</span>
          </div>
          <div className="flex flex-1 items-center justify-center gap-1 py-1.5">
            <span className="text-muted-foreground">总数</span>
            <span className="font-semibold text-foreground">{total}</span>
          </div>
        </div>

        {/* 操作区：删除（左下） + 编辑（右下），均为 neu 按钮 */}
        <div className={cn("pointer-events-auto flex items-center justify-between", c.actionsMt)}>
          <button
            type="button"
            aria-label="删除清单"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(checklist);
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
            aria-label="编辑清单"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(checklist);
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
