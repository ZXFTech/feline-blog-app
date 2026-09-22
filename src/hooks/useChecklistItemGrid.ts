"use client";

import { useEffect, useRef, useState } from "react";

/** Fit by the minimum size, then let CSS cap and center the occupied tracks. */
export function useChecklistItemGrid<T extends HTMLElement>(itemCount: number) {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const minimum = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 12;
      const gap = Number.parseFloat(getComputedStyle(grid).columnGap);
      const capacity = Math.max(
        1,
        Math.floor((grid.getBoundingClientRect().width + gap) / (minimum + gap))
      );
      setColumns(Math.max(1, Math.min(itemCount, capacity)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [itemCount]);

  return { ref, style: { gridTemplateColumns: `repeat(${columns}, minmax(12rem, 12.5rem))` } };
}
