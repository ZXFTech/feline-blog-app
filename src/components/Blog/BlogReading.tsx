"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ProgressBar } from "@/components/ui/progress-bar";
import { consumeReadingTraversal } from "@/lib/blog/navigation";
import {
  collectHeadings,
  findReadingRoot,
  readingSnapshot,
  resolveFragment,
  type ReadingHeading,
} from "@/lib/blog/reading";

interface TocState {
  headings: ReadingHeading[];
  activeId: string | null;
  navigate: (id: string) => void;
  isolated: boolean;
}
interface ProgressState {
  value: number | null;
  barTop: number;
}
interface PendingNavigation {
  target: HTMLElement;
  lastTop: number | null;
  lastScrollTop: number | null;
  stableFrames: number;
  stableScrollFrames: number;
  corrections: number;
  expiresAt: number;
}
const TocContext = createContext<TocState | null>(null);
const ProgressContext = createContext<ProgressState>({ value: null, barTop: 0 });
export function useBlogToc() {
  return useContext(TocContext);
}

interface BlogReadingProps {
  articleKey: string;
  articleTitle: string;
  children: ReactNode;
  isolated?: boolean;
}
export function BlogReading({ articleKey, ...props }: BlogReadingProps) {
  return <ReadingInstance key={articleKey} {...props} />;
}

function ReadingInstance({
  articleTitle,
  children,
  isolated = false,
}: Omit<BlogReadingProps, "articleKey">) {
  const instanceRef = useRef<HTMLDivElement>(null);
  const navigateRef = useRef<(id: string) => void>(() => {});
  const initializedRef = useRef(false);
  const restoringRef = useRef(false);
  const [toc, setToc] = useState<Pick<TocState, "headings" | "activeId">>({
    headings: [],
    activeId: null,
  });
  const [progress, setProgress] = useState<ProgressState>({ value: null, barTop: 0 });

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    let disposed = false;
    let frame = 0;
    let navigationFrame = 0;
    let pendingNavigation: PendingNavigation | null = null;
    let body: HTMLElement | null = null;
    let root: HTMLElement | null = null;
    let headings: ReadingHeading[] = [];
    let headingsDirty = true;
    let publishedHeadings: ReadingHeading[] | null = null;
    let publishedActiveId: string | null = null;
    if (!isolated && consumeReadingTraversal(window.location.href)) restoringRef.current = true;
    let initialFragment = !isolated && !initializedRef.current && !restoringRef.current;
    let traversing = false;
    let knownHash = window.location.hash;
    const registeredPath = window.location.pathname;
    const track = instance.querySelector<HTMLElement>("[data-reading-progress]");
    const navbar = isolated ? null : document.querySelector<HTMLElement>(".navbar");
    const footer = isolated ? null : document.querySelector<HTMLElement>('[role="contentinfo"]');
    const visual = window.visualViewport;
    function schedule() {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    }
    function cancelNavigation() {
      cancelAnimationFrame(navigationFrame);
      navigationFrame = 0;
      pendingNavigation = null;
    }
    function afterTocLayout(action: () => void) {
      cancelNavigation();
      navigationFrame = requestAnimationFrame(() => {
        navigationFrame = requestAnimationFrame(() => {
          navigationFrame = 0;
          if (!disposed) action();
        });
      });
    }
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    function register() {
      const next = instance!.querySelector<HTMLElement>(".blog-markdown");
      if (next === body) return;
      cancelNavigation();
      if (body) resize?.unobserve(body);
      body = next;
      headingsDirty = true;
      if (body) resize?.observe(body);
    }
    function viewport() {
      const windowTop = visual?.offsetTop ?? 0;
      const windowBottom = windowTop + (visual?.height ?? window.innerHeight);
      const rect = root?.getBoundingClientRect();
      let top = Math.max(windowTop, rect ? rect.top + root!.clientTop : windowTop);
      let bottom = Math.min(
        windowBottom,
        rect ? rect.top + root!.clientTop + root!.clientHeight : windowBottom
      );
      const bodyBox = body!.getBoundingClientRect();
      let barTop = top;
      const overlaps = (element: HTMLElement | null) => {
        if (
          !element ||
          !element.getClientRects().length ||
          getComputedStyle(element).visibility === "hidden"
        )
          return null;
        const box = element.getBoundingClientRect();
        return box.width > 0 &&
          box.height > 0 &&
          box.right > bodyBox.left &&
          box.left < bodyBox.right &&
          box.bottom > windowTop &&
          box.top < windowBottom
          ? box
          : null;
      };
      const navBox = overlaps(navbar);
      if (navBox) barTop = Math.max(barTop, navBox.bottom);
      top = Math.max(top, barTop + (track?.getBoundingClientRect().height ?? 0));
      const footerBox = overlaps(footer);
      if (footerBox) bottom = Math.min(bottom, footerBox.top);
      return { top, bottom, barTop };
    }
    function measure() {
      frame = 0;
      if (disposed) return;
      register();
      if (!body) {
        cancelNavigation();
        setToc((old) =>
          old.headings.length || old.activeId ? { headings: [], activeId: null } : old
        );
        setProgress((old) => (old.value === null ? old : { ...old, value: null }));
        return;
      }
      const nextRoot = findReadingRoot(body);
      if (nextRoot !== root) {
        root?.removeEventListener("scroll", schedule);
        root = nextRoot;
        root?.addEventListener("scroll", schedule, { passive: true });
      }
      if (headingsDirty) {
        headings = collectHeadings(body);
        headingsDirty = false;
      }
      const { top, bottom, barTop } = viewport();
      body.style.setProperty(
        "--blog-reading-offset",
        `${Math.max(0, top - (root?.getBoundingClientRect().top ?? 0))}px`
      );
      const box = body.getBoundingClientRect();
      const snapshot = readingSnapshot(
        box.top,
        box.bottom,
        top,
        bottom,
        headings.map((item) => ({ id: item.id, top: item.element.getBoundingClientRect().top }))
      );
      if (publishedHeadings !== headings || publishedActiveId !== snapshot.activeId) {
        const preservePosition =
          publishedHeadings === headings && !pendingNavigation && !navigationFrame;
        const publish = () => setToc({ headings, activeId: snapshot.activeId });
        if (preservePosition) {
          // A wrapping summary is above the body. Preserve the reader's actual
          // position when it changes height, including browsers without native
          // scroll anchoring. Measure both sides of this one React commit so
          // native anchoring is not applied twice and user scrolling is excluded.
          flushSync(publish);
          const shift = body.getBoundingClientRect().top - box.top;
          if (Math.abs(shift) > 0.5) {
            if (root) root.scrollTo({ top: root.scrollTop + shift, behavior: "instant" });
            else window.scrollTo({ top: window.scrollY + shift, behavior: "instant" });
            schedule();
          }
        } else publish();
        publishedHeadings = headings;
        publishedActiveId = snapshot.activeId;
      }
      setProgress((old) =>
        old.value === snapshot.value && old.barTop === barTop
          ? old
          : { value: snapshot.value, barTop }
      );
      if (initialFragment) {
        initialFragment = false;
        // Publishing headings mounts the compact TOC before the body. Wait for
        // that React commit before measuring an initial fragment destination.
        afterTocLayout(followFragment);
      }
      initializedRef.current = true;
      settleNavigation();
    }
    function settleNavigation() {
      const navigation = pendingNavigation;
      if (!navigation) return;
      if (
        performance.now() > navigation.expiresAt ||
        !instance!.contains(navigation.target) ||
        !navigation.target.getClientRects().length
      ) {
        cancelNavigation();
        return;
      }
      const targetTop = navigation.target.getBoundingClientRect().top;
      const scrollTop = root?.scrollTop ?? window.scrollY;
      const scrollIsStable =
        navigation.lastScrollTop !== null && Math.abs(scrollTop - navigation.lastScrollTop) < 0.5;
      navigation.stableScrollFrames = scrollIsStable ? navigation.stableScrollFrames + 1 : 0;
      navigation.stableFrames =
        navigation.lastTop !== null &&
        Math.abs(targetTop - navigation.lastTop) < 0.5 &&
        scrollIsStable
          ? navigation.stableFrames + 1
          : 0;
      navigation.lastTop = targetTop;
      navigation.lastScrollTop = scrollTop;
      if (navigation.stableScrollFrames >= 3) {
        const delta = targetTop - viewport().top;
        const scroller = root ?? document.scrollingElement ?? document.documentElement;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const destination = Math.min(maxScroll, Math.max(0, scrollTop + delta));
        if (Math.abs(delta) > 1 && Math.abs(destination - scrollTop) > 0.5) {
          if (navigation.corrections >= 4) {
            cancelNavigation();
            return;
          }
          // The summary may alternate heights even after native scrolling has
          // stopped. Correct from the actual target without waiting for that
          // layout feedback to settle on its own.
          if (root) root.scrollTo({ top: destination, behavior: "instant" });
          else window.scrollTo({ top: destination, behavior: "instant" });
          navigation.corrections += 1;
          navigation.stableFrames = 0;
          navigation.stableScrollFrames = 0;
        } else if (navigation.stableFrames >= 3) pendingNavigation = null;
      }
      // Frame sampling exists only while a navigation is settling. Images and
      // later resizes merely remeasure once this navigation has completed.
      if (pendingNavigation) schedule();
    }
    function moveTo(target: HTMLElement, focus: boolean, smooth: boolean) {
      if (!body || !instance!.contains(target)) return;
      pendingNavigation = {
        target,
        lastTop: null,
        lastScrollTop: null,
        stableFrames: 0,
        stableScrollFrames: 0,
        corrections: 0,
        expiresAt: performance.now() + 5000,
      };
      const scrollRoot = findReadingRoot(body);
      const { top } = viewport();
      const delta = target.getBoundingClientRect().top - top;
      const behavior =
        smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant";
      if (scrollRoot) scrollRoot.scrollTo({ top: scrollRoot.scrollTop + delta, behavior });
      else window.scrollTo({ top: window.scrollY + delta, behavior });
      if (focus) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
      schedule();
    }
    function followFragment() {
      if (!body || isolated) return;
      const heading = resolveFragment(window.location.hash, headings);
      if (heading) moveTo(heading.element, false, false);
      else {
        try {
          if (
            window.location.hash &&
            decodeURIComponent(window.location.hash.slice(1)) === articleTitle
          ) {
            const title = instance!.querySelector<HTMLElement>("[data-blog-title]");
            if (title) moveTo(title, false, false);
          }
        } catch {
          /* Invalid fragments leave the document readable. */
        }
      }
    }
    navigateRef.current = (id) => {
      // A queued frame must not navigate a replacement root that reuses its slug.
      const navigationBody = body;
      afterTocLayout(() => {
        if (
          disposed ||
          !body ||
          body !== navigationBody ||
          instance.querySelector(".blog-markdown") !== navigationBody
        )
          return;
        headings = collectHeadings(body);
        const heading = headings.find((item) => item.id === id);
        if (!heading) {
          headingsDirty = true;
          schedule();
          return;
        }
        if (!isolated) {
          const url = new URL(window.location.href);
          url.hash = encodeURIComponent(id);
          window.history.replaceState(window.history.state, "", url);
          knownHash = url.hash;
        }
        moveTo(heading.element, true, true);
      });
    };
    const onHashChange = () => {
      knownHash = window.location.hash;
      headingsDirty = true;
      schedule();
      if (traversing) {
        traversing = false;
        return;
      }
      if (body) headings = collectHeadings(body);
      afterTocLayout(followFragment);
    };
    const onPopState = () => {
      cancelNavigation();
      if (window.location.pathname === registeredPath)
        consumeReadingTraversal(window.location.href);
      initialFragment = false;
      traversing = knownHash !== window.location.hash;
      knownHash = window.location.hash;
      schedule();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        initialFragment = false;
        cancelNavigation();
      }
      schedule();
    };
    const onImage = (event: Event) => {
      if (event.target instanceof HTMLImageElement) schedule();
    };
    const onUserInput = () => {
      initialFragment = false;
      cancelNavigation();
    };
    const interruptionEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const mutation = new MutationObserver((records) => {
      const next = instance.querySelector<HTMLElement>(".blog-markdown");
      if (next !== body || records.some((record) => body?.contains(record.target))) {
        headingsDirty = true;
        schedule();
      }
    });
    mutation.observe(instance, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["id"],
    });
    for (let element: HTMLElement | null = instance; element; element = element.parentElement)
      resize?.observe(element);
    for (const element of [navbar, footer, track]) if (element) resize?.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    for (const event of interruptionEvents)
      window.addEventListener(event, onUserInput, { passive: true, capture: true });
    instance.addEventListener("load", onImage, true);
    instance.addEventListener("error", onImage, true);
    void document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelNavigation();
      mutation.disconnect();
      resize?.disconnect();
      root?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
      for (const event of interruptionEvents) window.removeEventListener(event, onUserInput, true);
      instance.removeEventListener("load", onImage, true);
      instance.removeEventListener("error", onImage, true);
      navigateRef.current = () => {};
    };
  }, [articleTitle, isolated]);

  return (
    <TocContext value={{ ...toc, isolated, navigate: (id) => navigateRef.current(id) }}>
      <ProgressContext value={progress}>
        <div
          ref={instanceRef}
          className="blog-reading-instance min-w-0 p-0"
          data-reading-isolated={isolated || undefined}
        >
          <ReadingProgress isolated={isolated} />
          {children}
        </div>
      </ProgressContext>
    </TocContext>
  );
}

function ReadingProgress({ isolated }: { isolated?: boolean }) {
  const { value, barTop } = useContext(ProgressContext);
  return (
    <div
      data-reading-progress=""
      className="blog-reading-progress p-0"
      style={{ top: isolated ? 0 : barTop, visibility: value === null ? "hidden" : "visible" }}
      aria-hidden={value === null || undefined}
    >
      <ProgressBar
        value={value ?? 0}
        size="sm"
        aria-label="正文阅读进度"
        progressBarColor="var(--foreground)"
      />
    </div>
  );
}
