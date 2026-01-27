"use client";

import {
  CSSProperties,
  ReactNode,
  RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Portal from "../Portal";

interface Props {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  children: ReactNode;
  offset?: number;
  position?: "top" | "bottom";
  align: "center" | "left" | "right";
}

function Floating({
  anchorRef,
  open,
  offset = 0,
  children,
  align = "left",
  position = "top",
}: Props) {
  const [style, setStyle] = useState<CSSProperties>();

  const popupRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open && !anchorRef.current && !popupRef.current) {
      return;
    }
    const update = () => {
      if (!open && !anchorRef.current && !popupRef.current) {
        return;
      }

      const rect = anchorRef.current?.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const popupHeight = popupRef.current?.clientHeight || 0;
      const popupWidth = popupRef.current?.clientWidth || 0;
      let top =
        position === "top" ? rect.top - popupHeight - 10 : rect.bottom + 10;
      if (top < 0) {
        top = 0;
      } else if (top > vh - popupHeight) {
        top = vh - popupHeight;
      }
      let left =
        align === "left"
          ? rect.left
          : align === "right"
            ? rect.right - popupWidth
            : rect.left - popupWidth / 2;
      if (left + popupWidth > vw) {
        left = vw - popupWidth;
      } else if (left < 0) {
        left = 0;
      }

      setStyle({
        position: "fixed",
        left: left,
        top: top,
        zIndex: 1000,
      });
    };

    const throttleUpdate = update;
    update();
    // const throttleUpdate = throttle(update, 500);
    window.addEventListener("scroll", throttleUpdate, true);
    window.addEventListener("resize", throttleUpdate, true);

    return () => {
      window.removeEventListener("scroll", throttleUpdate, true);
      window.removeEventListener("resize", throttleUpdate, true);
    };
  }, [open, anchorRef, offset, popupRef, align, position]);

  if (!open) {
    return null;
  }

  return (
    <Portal>
      <div ref={popupRef} style={style}>
        {children}
      </div>
    </Portal>
  );
}

export default Floating;
