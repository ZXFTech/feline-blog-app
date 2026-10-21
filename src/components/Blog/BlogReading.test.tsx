import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlogReading } from "@/components/Blog/BlogReading";
import TOC from "@/components/Blog/TOC";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("文章阅读实例 (spec 0013)", () => {
  // AC-5, AC-6: the first pageshow must not suppress a newly opened fragment.
  it("首次 pageshow 早于测量帧时仍定位初始片段", () => {
    history.replaceState(null, "", "/blog/7#章节");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(
      <BlogReading articleKey="seven" articleTitle="文章">
        <TOC compact />
        <div className="blog-markdown">
          <h1 id="章节">章节</h1>
        </div>
      </BlogReading>
    );
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: false }));
    for (let frame = 0; frame < 3; frame++) {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    }
    expect(scroll).toHaveBeenCalledOnce();
  });

  // AC-6: both user interruption and replacing the keyed reader cancel old navigation.
  it("用户滚动或文章更换会取消尚未执行的目录导航", () => {
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const advance = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    };
    const view = (key: string) => (
      <BlogReading articleKey={key} articleTitle={key}>
        <TOC compact />
        <div className="blog-markdown">
          <h1 id={key}>{key}</h1>
        </div>
      </BlogReading>
    );
    const { rerender } = render(view("旧章节"));
    advance();
    advance();
    advance();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("link"));
    fireEvent.wheel(window);
    advance();
    advance();
    expect(location.hash).toBe("");
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("link"));
    rerender(view("新章节"));
    advance();
    advance();
    advance();
    expect(location.hash).toBe("");
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("新章节");
    expect(screen.getByRole("heading")).not.toHaveFocus();
  });

  // AC-1, AC-2, AC-6, AC-7: stale scans and an unkeyed disclosure break this path.
  it("随正文替换重建标题，切换文章后丢弃旧目录与展开状态", async () => {
    const view = (key: string, text: string) => (
      <BlogReading articleKey={key} articleTitle={key}>
        <h1 data-blog-title="">文章名称</h1>
        <TOC compact />
        <div className="blog-markdown">
          <h6 id={text}>{text}</h6>
        </div>
      </BlogReading>
    );
    const { rerender, container } = render(view("one", "旧章节"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "本文目录：旧章节" })).toBeInTheDocument()
    );
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("link", { name: "旧章节，6 级标题" })).toHaveAttribute(
      "href",
      expect.stringContaining("#")
    );
    expect(screen.queryByRole("link", { name: /文章名称/ })).not.toBeInTheDocument();
    await act(async () => {
      container.querySelector(".blog-markdown")!.innerHTML = '<h4 id="新章节">新章节</h4>';
    });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "新章节，4 级标题" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("link", { name: /旧章节/ })).not.toBeInTheDocument();
    rerender(view("two", "下一篇"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "本文目录：下一篇" })).toBeInTheDocument()
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  // AC-5: intercepting modified clicks would break native new-tab navigation.
  it("保留修饰键链接行为，普通导航合并保留 history.state", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    history.replaceState({ preserved: "next-router" }, "", "/blog/7?mode=read");
    render(
      <BlogReading articleKey="seven" articleTitle="文章">
        <TOC compact />
        <div className="blog-markdown">
          <h1 id="中文">中文</h1>
        </div>
      </BlogReading>
    );
    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button"));
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/blog/7?mode=read#%E4%B8%AD%E6%96%87");
    let intercepted: boolean | undefined;
    document.addEventListener(
      "click",
      (event) => {
        intercepted = event.defaultPrevented;
        // jsdom cannot open a native new tab. Stop only its simulated navigation.
        event.preventDefault();
      },
      { once: true }
    );
    fireEvent.click(link, { ctrlKey: true });
    expect(intercepted).toBe(false);
    expect(location.hash).toBe("");
    fireEvent.click(link);
    await waitFor(() => expect(location.hash).toBe("#%E4%B8%AD%E6%96%87"));
    expect(history.state).toEqual({ preserved: "next-router" });
    expect(screen.getByRole("heading")).toHaveFocus();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  // AC-2, AC-5, AC-8: the disclosure and its real links form a natural keyboard path.
  it("从目录开关按 Tab 进入章节，Enter 后收起并聚焦正文", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(
      <BlogReading articleKey="keyboard" articleTitle="文章">
        <TOC compact />
        <div className="blog-markdown">
          <h1 id="第一节">第一节</h1>
          <h2 id="第二节">第二节</h2>
        </div>
      </BlogReading>
    );
    const toggle = await screen.findByRole("button", { name: /^本文目录/ });
    const controlled = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(controlled).not.toBeNull();
    expect(controlled).toHaveAttribute("hidden");

    await user.click(toggle);
    await user.tab();
    expect(screen.getByRole("link", { name: "第一节，1 级标题" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "第二节，2 级标题" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByRole("heading", { name: "第二节" })).toHaveFocus());
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controlled).toHaveAttribute("hidden");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(decodeURIComponent(location.hash)).toBe("#第二节");
  });

  // AC-3, AC-6, AC-8: resize events still refresh accessible progress without an observer.
  it("缺少 ResizeObserver 时仍随窗口变化重算正文进度", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal("innerHeight", 800);
    let height = 2000;
    const { container } = render(
      <BlogReading articleKey="fallback" articleTitle="文章">
        <div className="blog-markdown">
          <h1 id="章节">章节</h1>
        </div>
      </BlogReading>
    );
    const body = container.querySelector<HTMLElement>(".blog-markdown")!;
    vi.spyOn(body, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, -600, 500, height)
    );
    const progress = await screen.findByRole("progressbar", { name: "正文阅读进度" });
    expect(progress).toHaveAttribute("aria-valuenow", "50");
    expect(progress.closest("[aria-live]")).toBeNull();

    height = 3200;
    act(() => window.dispatchEvent(new Event("resize")));
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "25"));
  });

  // AC-6: teardown must release browser resources and prevent late font work reviving frames.
  it.each(["首帧前", "两帧之间"])("导航%s卸载后取消帧并释放全部阅读监听", async (phase) => {
    const user = userEvent.setup();
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const advance = () => {
      const batch = [...frames.entries()];
      act(() => {
        for (const [id, callback] of batch) if (frames.delete(id)) callback(0);
      });
    };
    const resize = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = resize.observe;
        unobserve = resize.unobserve;
        disconnect = resize.disconnect;
      }
    );
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const visual = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    vi.stubGlobal("visualViewport", visual);
    const addVisual = vi.spyOn(visual, "addEventListener");
    const removeVisual = vi.spyOn(visual, "removeEventListener");
    const addWindow = vi.spyOn(window, "addEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const root = document.createElement("div");
    root.style.overflowY = "auto";
    Object.defineProperty(root, "clientHeight", { value: 800 });
    root.scrollTo = vi.fn();
    document.body.append(root);
    const addRoot = vi.spyOn(root, "addEventListener");
    const removeRoot = vi.spyOn(root, "removeEventListener");
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    let finishFonts!: () => void;
    const ready = new Promise<void>((resolve) => {
      finishFonts = resolve;
    });
    const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
    const { unmount } = render(
      <BlogReading articleKey="unmount" articleTitle="文章">
        <TOC compact />
        <div className="blog-markdown">
          <h1 id="旧章节">旧章节</h1>
        </div>
      </BlogReading>,
      { container: root }
    );
    try {
      // React owns delegated listeners on its render container; measure the reader's subscription.
      addRoot.mockClear();
      advance();
      advance();
      advance();
      await user.click(screen.getByRole("button", { name: /^本文目录/ }));
      await user.click(screen.getByRole("link", { name: "旧章节，1 级标题" }));
      if (phase === "两帧之间") advance();
      expect(frames.size).toBeGreaterThan(0);

      unmount();
      expect(frames.size).toBe(0);
      expect(resize.disconnect).toHaveBeenCalledOnce();
      expect(mutationDisconnect).toHaveBeenCalledOnce();
      const rootScrollSubscriptions = addRoot.mock.calls.filter(([event]) => event === "scroll");
      expect(rootScrollSubscriptions).toHaveLength(1);
      for (const [event, listener] of rootScrollSubscriptions)
        expect(removeRoot).toHaveBeenCalledWith(event, listener);
      for (const [event, listener] of addVisual.mock.calls)
        expect(removeVisual).toHaveBeenCalledWith(event, listener);
      for (const [event, listener, options] of addWindow.mock.calls.filter(([event]) =>
        [
          "scroll",
          "resize",
          "hashchange",
          "popstate",
          "pageshow",
          "wheel",
          "touchstart",
          "pointerdown",
          "keydown",
        ].includes(event)
      )) {
        const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
        expect(
          removeWindow.mock.calls.some(
            ([removed, callback, removedOptions]) =>
              removed === event &&
              callback === listener &&
              (typeof removedOptions === "boolean"
                ? removedOptions
                : (removedOptions?.capture ?? false)) === capture
          )
        ).toBe(true);
      }
      await act(async () => {
        root.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("hashchange"));
        visual.dispatchEvent(new Event("resize"));
        finishFonts();
        await ready;
      });
      advance();
      expect(frames.size).toBe(0);
      expect(scroll).not.toHaveBeenCalled();
      expect(root.scrollTo).not.toHaveBeenCalled();
      expect(location.hash).toBe("");
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    } finally {
      unmount();
      root.remove();
      if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
});
