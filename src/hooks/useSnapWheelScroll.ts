"use client";

import { useEffect, useRef } from "react";

type SnapWheelOptions = {
  /**
   * 累计多少 wheel delta 才触发一次“跳动滚动”
   * 建议：80~160（看你的鼠标/触控板）
   */
  threshold?: number;

  /**
   * 每次触发滚动的固定距离（px）
   * 建议：80~240（按行高/卡片高度）
   */
  step?: number;

  /**
   * 是否启用平滑动画（你要“固定距离”，可选 smooth 或 auto）
   * - auto: 立即跳
   * - smooth: 平滑滚到目标
   */
  behavior?: ScrollBehavior;

  /**
   * 停止滚轮后多少 ms 清空累积（避免残余）
   */
  resetAfterMs?: number;

  /**
   * 允许按住 Shift 横向滚动时不拦截（可选）
   */
  allowShiftForHorizontal?: boolean;
};

export function useSnapWheelScroll(
  containerRef: React.RefObject<HTMLElement>,
  opts: SnapWheelOptions = {},
) {
  const {
    threshold = 120,
    step = 160,
    behavior = "auto",
    resetAfterMs = 180,
    allowShiftForHorizontal = true,
  } = opts;

  const accRef = useRef(0);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // 1) 可选：按住 Shift 让横向滚动保持原生（常见 UX）
      if (allowShiftForHorizontal && e.shiftKey) return;

      // 2) 阻止默认滚动（必须 passive:false 才能 preventDefault 生效）
      e.preventDefault();

      // 3) 累积 delta（不同设备 delta 量级不同，这就是我们要“累积再触发”的原因）
      accRef.current += e.deltaY;

      // 4) 每次滚轮都重置一个“清空累积”的定时器
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        accRef.current = 0;
      }, resetAfterMs);

      // 5) 当累计超过阈值，触发一个或多个 step
      const absAcc = Math.abs(accRef.current);
      if (absAcc < threshold) return;

      // 可一次触发多步（比如用户滚轮很猛）
      const direction = accRef.current > 0 ? 1 : -1;
      const stepsToFire = Math.floor(absAcc / threshold);

      // 扣掉已消费的累计量（保留余数）
      accRef.current -= direction * stepsToFire * threshold;

      // 6) 执行滚动：固定距离 step * stepsToFire
      const delta = direction * step * stepsToFire;

      // 边界：避免滚过头（可选，但建议做）
      const maxScrollTop = el.scrollHeight - el.clientHeight;
      const target = clamp(el.scrollTop + delta, 0, maxScrollTop);

      el.scrollTo({ top: target, behavior });
    };

    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, [
    containerRef,
    threshold,
    step,
    behavior,
    resetAfterMs,
    allowShiftForHorizontal,
  ]);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
