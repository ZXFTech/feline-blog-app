"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
    title: "mt-3 line-clamp-2 text-sm font-semibold leading-5",
    deadline: "mt-1 text-body-base",
    totals: "text-body-base",
    actionsMt: "mt-3",
  },
  md: {
    width: 192,
    height: 180,
    strip: "h-1",
    pad: "p-[var(--spacing-card-pad-md)]",
    status: 8,
    countdown: "text-[9px]",
    title: "mt-2 line-clamp-2 text-xs font-semibold leading-4",
    deadline: "mt-0.5 text-[10px]",
    totals: "text-[10px]",
    actionsMt: "mt-2",
  },
  sm: {
    width: 128,
    height: 120,
    strip: "h-0.5",
    pad: "p-[var(--spacing-card-pad-sm)]",
    status: 6,
    countdown: "text-[7px]",
    title: "mt-1 line-clamp-2 text-[10px] font-semibold leading-3",
    deadline: "mt-0.5 text-[8px]",
    totals: "text-[8px]",
    actionsMt: "mt-1",
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
  serverNow,
}: {
  expiresAt: number;
  textClass: string;
  serverNow?: number;
}) {
  const calibration = useRef({
    serverNow: serverNow ?? 0,
    receivedAt: 0,
  });
  const [now, setNow] = useState(serverNow ?? 0);

  useEffect(() => {
    calibration.current = { serverNow: serverNow ?? Date.now(), receivedAt: performance.now() };
    setNow(calibration.current.serverNow);
  }, [serverNow]);

  useEffect(() => {
    const id = setInterval(() => {
      const current = calibration.current;
      setNow(current.serverNow + performance.now() - current.receivedAt);
    }, 30_000);
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
      {cd.urgent ? <span className="text-destructive">即将到期</span> : null}
      <span className="text-foreground">{cd.label}</span>
    </span>
  );
}

export interface ChecklistCardProps {
  checklist: Checklist;
  size?: ChecklistCardSize;
  layout?: "card" | "list";
  onOpenDetail?: (checklist: Checklist) => void;
  onEdit?: (checklist: Checklist) => void;
  onDelete?: (checklist: Checklist) => void;
  serverNow?: number;
}

export function ChecklistCard({
  checklist,
  size = "lg",
  layout = "card",
  onOpenDetail,
  onEdit,
  onDelete,
  serverNow,
}: ChecklistCardProps) {
  const { done, total } = getProgress(checklist);
  const c = SIZE_CONFIG[size];

  return (
    <NeuSurface
      radius="xl"
      style={{
        width: layout === "list" ? "100%" : c.width,
        height: layout === "list" ? (size === "lg" ? 96 : size === "md" ? 80 : 64) : c.height,
        borderColor: checklist.themeColor ?? "var(--primary)",
      }}
      className={cn(
        "relative flex flex-col overflow-hidden border",
        "transition-colors hover:bg-muted"
      )}
    >
      <Button
        type="button"
        aria-label={`查看清单详情：${checklist.name}`}
        onClick={() => onOpenDetail?.(checklist)}
        className="absolute inset-0 z-0 h-auto w-auto opacity-0"
      />
      {/* 顶部主题色窄条 */}
      <div
        className={cn("w-full shrink-0", c.strip)}
        style={{ background: checklist.themeColor }}
        aria-hidden
      />

      <div
        className={cn(
          "pointer-events-none relative z-10 flex flex-1 whitespace-nowrap",
          layout === "list" ? "flex-row items-center gap-3 px-4 py-2" : "flex-col",
          layout === "card" && c.pad
        )}
      >
        {layout === "list" ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 whitespace-nowrap">
            <StatusIndicator done={done} total={total} size={14} />
            <h3
              title={checklist.name}
              className="min-w-0 truncate text-sm font-semibold leading-none text-foreground"
            >
              {checklist.name}
            </h3>
            <CountdownBadge
              expiresAt={checklist.expiresAt}
              textClass="shrink-0 text-sm"
              serverNow={serverNow}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <StatusIndicator done={done} total={total} size={c.status} />
              <CountdownBadge
                expiresAt={checklist.expiresAt}
                textClass={c.countdown}
                serverNow={serverNow}
              />
            </div>
            <h3
              title={checklist.name}
              className={cn("min-w-0 truncate text-foreground text-pretty", c.title)}
            >
              {checklist.name}
            </h3>
          </>
        )}

        {/* 截止日期（小字号，精确到分钟） */}
        <p
          className={cn(
            "shrink-0 whitespace-nowrap text-muted-foreground",
            layout === "card" ? c.deadline : "hidden text-xs lg:block"
          )}
        >
          截止日期: {formatDeadline(checklist.expiresAt)}
        </p>

        {/* 已完成 / 总数（纯文本，无边框无背景，与卡片底色统一） */}
        <div
          className={cn(
            "items-stretch whitespace-nowrap",
            layout === "card" ? `mt-auto flex ${c.totals}` : "hidden shrink-0 text-xs md:flex"
          )}
        >
          <div className="flex flex-1 items-center justify-center gap-1 py-1.5">
            <span className="text-muted-foreground">已完成</span>
            <span className="font-semibold text-foreground">{done}</span>
          </div>
          <div className="flex flex-1 items-center justify-center gap-1 py-1.5">
            <span className="text-muted-foreground">总数</span>
            <span className="font-semibold text-foreground">{total}</span>
          </div>
        </div>

        <div
          className={cn(
            "pointer-events-auto flex items-center gap-2",
            layout === "card" ? `w-full justify-between ${c.actionsMt}` : "shrink-0 justify-end"
          )}
        >
          <Button
            type="button"
            size="icon"
            variant="danger"
            aria-label="删除清单"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(checklist);
            }}
          >
            <Trash2 />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="primary"
            aria-label="编辑清单"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(checklist);
            }}
          >
            <Pencil />
          </Button>
        </div>
      </div>
    </NeuSurface>
  );
}
