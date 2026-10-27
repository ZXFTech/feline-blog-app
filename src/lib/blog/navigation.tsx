"use client";

import { useLayoutEffect } from "react";

let traversalUrl: string | null = null;

export function consumeReadingTraversal(url: string): boolean {
  const restored = traversalUrl === url;
  traversalUrl = null;
  return restored;
}

// Routes without a reader still need to identify back/forward navigation.
// The shell owns this listener. No scroll position or history state is stored.
export function BlogReadingNavigation() {
  useLayoutEffect(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation?.type === "back_forward") traversalUrl = window.location.href;
    const onPopState = () => {
      traversalUrl = window.location.href;
    };
    const onLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link && (!link.target || link.target === "_self")) traversalUrl = null;
    };
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", onLink, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", onLink, true);
      traversalUrl = null;
    };
  }, []);
  return null;
}
