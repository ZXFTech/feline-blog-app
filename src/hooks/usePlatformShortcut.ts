"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const isApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export function usePlatformShortcut() {
  const isApple = useSyncExternalStore(subscribe, isApplePlatform, () => false);
  return {
    modifier: isApple ? "⌘" : "Ctrl",
    modifierName: isApple ? "Command" : "Control",
    matches: (event: { metaKey: boolean; ctrlKey: boolean }) =>
      isApple ? event.metaKey : event.ctrlKey,
  };
}
