import { describe, expect, it } from "vitest";
import {
  collectHeadings,
  findReadingRoot,
  readingSnapshot,
  resolveFragment,
} from "@/lib/blog/reading";

describe("正文阅读边界 (spec 0013)", () => {
  // AC-3, AC-4: using the whole page or allowing progress outside its range breaks these.
  it("只按正文与有效阅读区域计算，可前进、反向并钳制", () => {
    expect(readingSnapshot(200, 2200, 200, 1000, [])).toEqual({ value: 0, activeId: null });
    expect(readingSnapshot(-400, 1600, 200, 1000, [])).toEqual({ value: 50, activeId: null });
    expect(readingSnapshot(-1000, 1000, 200, 1000, [])).toEqual({ value: 100, activeId: null });
    expect(readingSnapshot(400, 2400, 200, 1000, []).value).toBe(0);
    expect(readingSnapshot(-2000, 0, 200, 1000, []).value).toBe(100);
    expect(readingSnapshot(-100, 1900, 200, 1000, []).value).toBe(25);
  });

  // AC-3, AC-7: a short/empty body must never show a fabricated percentage.
  it("隐藏短文、空文与无效阅读区域", () => {
    for (const [start, end, top, bottom] of [
      [0, 800, 0, 800],
      [0, 801, 0, 800],
      [0, 0, 0, 800],
      [0, 2000, 800, 800],
    ]) {
      expect(readingSnapshot(start, end, top, bottom, []).value).toBeNull();
    }
  });

  // AC-3, AC-7: invalid geometry cannot escape as NaN or Infinity in accessible progress.
  it.each([
    { reason: "正文顶部为 NaN", start: Number.NaN, end: 2000, top: 0, bottom: 800 },
    { reason: "正文底部为无穷大", start: 0, end: Number.POSITIVE_INFINITY, top: 0, bottom: 800 },
    { reason: "阅读线为 NaN", start: 0, end: 2000, top: Number.NaN, bottom: 800 },
    { reason: "阅读区底部为无穷大", start: 0, end: 2000, top: 0, bottom: Number.POSITIVE_INFINITY },
    { reason: "正文高度为负", start: 2000, end: 0, top: 0, bottom: 800 },
    { reason: "阅读区域倒置", start: 0, end: 2000, top: 800, bottom: 0 },
  ])("$reason 时不显示阅读进度", ({ start, end, top, bottom }) => {
    expect(readingSnapshot(start, end, top, bottom, []).value).toBeNull();
  });

  // AC-3: the one-pixel short-body tolerance must not hide longer fractional content.
  it("超过一像素容差的正文恢复有效进度", () => {
    expect(readingSnapshot(0, 801, 0, 800, []).value).toBeNull();
    expect(readingSnapshot(0, 801.125, 0, 800, []).value).toBe(0);
    expect(readingSnapshot(-1.125, 800, 0, 800, []).value).toBe(100);
  });

  // AC-2, AC-4, AC-6: the current vertical scrolling ancestor owns measurements.
  it("按最近的有效纵向滚动区选择根，布局改变后可退回页面", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    const body = document.createElement("article");
    outer.append(inner);
    inner.append(body);
    document.body.append(outer);
    outer.style.overflowY = "auto";
    inner.style.overflowY = "scroll";
    Object.defineProperty(outer, "clientHeight", { value: 800 });
    Object.defineProperty(inner, "clientHeight", { value: 500 });
    try {
      expect(findReadingRoot(body)).toBe(inner);
      inner.style.overflowY = "visible";
      expect(findReadingRoot(body)).toBe(outer);
      outer.style.overflowY = "visible";
      expect(findReadingRoot(body)).toBeNull();
    } finally {
      outer.remove();
    }
  });

  // AC-4, AC-7: horizontal overflow, clipped boxes and unready containers are not vertical roots.
  it.each(["visible", "hidden", "clip", "auto"])("忽略无效滚动容器 %s", (overflow) => {
    const parent = document.createElement("div");
    const body = document.createElement("article");
    parent.style.overflowX = "auto";
    parent.style.overflowY = overflow;
    Object.defineProperty(parent, "clientHeight", { value: overflow === "auto" ? 0 : 800 });
    parent.append(body);
    document.body.append(parent);
    try {
      expect(findReadingRoot(body)).toBeNull();
    } finally {
      parent.remove();
    }
  });

  // AC-1, AC-4: callback ordering cannot override the last heading above the reading line.
  it("按文档顺序选章节，未到首标题为空，长文末尾选最后章节", () => {
    const headings = [
      { id: "first", top: 300 },
      { id: "second", top: 500 },
      { id: "last", top: 1200 },
    ];
    expect(readingSnapshot(0, 2000, 200, 1000, headings).activeId).toBeNull();
    expect(readingSnapshot(-500, 1500, 501, 1000, headings).activeId).toBe("second");
    expect(readingSnapshot(-1200, 800, 200, 1000, headings).activeId).toBe("last");
    expect(readingSnapshot(0, 600, 200, 1000, headings).activeId).toBeNull();
  });

  // AC-1, AC-7: excluding H4-H6 or reading outside the body loses valid destinations.
  it("只收集正文六级有效标题，保留真实文字、顺序和已有 slug", () => {
    const body = document.createElement("div");
    body.innerHTML =
      '<h1 id="中文">中文 <em>格式</em></h1><h4 id="跳级">跳级</h4><h6 id="中文-1">中文</h6><h2>无标识</h2><h3 id="empty"> </h3>';
    expect(collectHeadings(body).map(({ id, text, level }) => ({ id, text, level }))).toEqual([
      { id: "中文", text: "中文 格式", level: 1 },
      { id: "跳级", text: "跳级", level: 4 },
      { id: "中文-1", text: "中文", level: 6 },
    ]);
    expect(resolveFragment("#%E4%B8%AD%E6%96%87", collectHeadings(body))?.id).toBe("中文");
    expect(resolveFragment("#%broken", collectHeadings(body))).toBeNull();
    expect(resolveFragment("#missing", collectHeadings(body))).toBeNull();
  });
});
