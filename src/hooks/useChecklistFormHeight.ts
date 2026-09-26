"use client";

import { useEffect, useRef } from "react";

/** Keep one full card reachable when fixed form controls exhaust the viewport. */
export function useChecklistFormHeight(enabled: boolean) {
  const formRef = useRef<HTMLFormElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = formRef.current;
    const section = sectionRef.current;
    const scroll = scrollRef.current;
    const parent = form?.parentElement;
    if (!enabled || !form || !section || !scroll || !parent || !window.ResizeObserver) return;
    let frame = 0;
    const measure = () => {
      const parentStyle = getComputedStyle(parent);
      const parentHeight =
        parent.clientHeight -
        parseFloat(parentStyle.paddingTop) -
        parseFloat(parentStyle.paddingBottom);
      const viewport = window.visualViewport;
      const keyboardInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      const height = Math.max(0, parentHeight - keyboardInset);
      const children = Array.from(form.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement
      );
      const gap = parseFloat(getComputedStyle(form).rowGap) || 0;
      const sectionGap = parseFloat(getComputedStyle(section).rowGap) || 0;
      const formStyle = getComputedStyle(form);
      const formPadding = parseFloat(formStyle.paddingTop) + parseFloat(formStyle.paddingBottom);
      const fixed =
        formPadding +
        children
          .filter((child) => child !== section)
          .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) +
        Math.max(0, children.length - 1) * gap +
        Array.from(section.children)
          .filter((child) => child !== scroll)
          .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) +
        sectionGap;
      const grid = scroll.querySelector<HTMLElement>(".checklist-item-grid");
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const cardSize = grid ? parseFloat(getComputedStyle(grid).gridTemplateColumns) : rem * 12.5;
      const scrollStyle = getComputedStyle(scroll);
      const minimum =
        Math.max(rem * 12, Math.min(rem * 12.5, cardSize || rem * 12.5)) +
        parseFloat(scrollStyle.paddingTop) +
        parseFloat(scrollStyle.paddingBottom);
      form.style.setProperty("--checklist-form-height", `${height}px`);
      form.style.setProperty("--checklist-list-min-height", `${minimum}px`);
      form.dataset.short = String(height - fixed < minimum);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(parent);
    resize.observe(section);
    for (const child of form.children) resize.observe(child);
    const mutation = new MutationObserver(schedule);
    mutation.observe(form, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [enabled]);

  return { formRef, sectionRef, scrollRef };
}
