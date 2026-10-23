import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import db from "../src/db/postgres/runtime";

const target = process.env.POSTGRES_DATABASE_URL
  ? new URL(process.env.POSTGRES_DATABASE_URL)
  : null;
const safeLocal =
  target &&
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
  target.pathname === "/feline_blog_dev" &&
  process.env.POSTGRES_ENVIRONMENT === "local";
test.skip(
  !safeLocal || !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
  "需要安全本地数据库和测试作者账号"
);
test.use({ trace: "off" });
test.setTimeout(90_000);

const paragraph = "正文阅读位置只取当前 Markdown。这段文字用来形成可滚动的真实文章。".repeat(30);
const longHeading = `第六级${"很长的中文标题".repeat(12)}`;
const longContent =
  `前导语。\n\n${paragraph}\n\n` +
  Array.from(
    { length: 6 },
    (_, index) =>
      `${"#".repeat(index + 1)} ${index ? `层级 ${index + 1}` : "中文格式 **章节**"}\n\n${paragraph}`
  ).join("\n\n") +
  '\n\n## 重复章节\n\n内容。\n\n## 重复章节\n\n```ts\nconst long = "' +
  "long ".repeat(90) +
  '";\n```\n\n## 短末节\n\n末尾。';
let ids: number[] = [];
let marker = "";
let authorId = "";

test.beforeAll(async ({}, info) => {
  const author = await db.user.findUnique({
    where: { email: process.env.E2E_USER_EMAIL!.toLowerCase() },
    select: { id: true, role: true },
  });
  expect(author?.role).toBe("ROOT");
  if (!author) throw new Error("安全测试作者不存在");
  authorId = author.id;
  marker = `reading-${info.project.name}-${Date.now()}`;
  for (const [name, content] of [
    ["long", longContent],
    ["short", "# 简短章节\n\n短正文。"],
    ["empty", ""],
    ["nohead", paragraph.repeat(8)],
    ["long-heading", longContent.replace("###### 层级 6", `###### ${longHeading}`)],
    ["collision", `# ${marker}-collision\n\n${paragraph.repeat(8)}`],
  ]) {
    const blog = await db.blog.create({
      data: { title: `${marker}-${name}`, content, authorId },
      select: { id: true },
    });
    ids.push(blog.id);
  }
});
test.afterAll(async () => {
  try {
    if (ids.length)
      await db.blog.deleteMany({
        where: { id: { in: ids }, authorId, title: { startsWith: marker } },
      });
  } finally {
    ids = [];
    await db.$disconnect();
  }
});

async function scrollReading(page: Page, edge: "start" | "middle" | "end") {
  await page.evaluate((position) => {
    const body = document.querySelector<HTMLElement>("#blog-content")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    const root = getComputedStyle(content).overflowY === "visible" ? null : content;
    const bodyBox = body.getBoundingClientRect();
    const top =
      document.querySelector(".navbar")!.getBoundingClientRect().bottom +
      document.querySelector("[data-reading-progress]")!.getBoundingClientRect().height;
    const bottom = Math.min(
      innerHeight,
      document.querySelector('[role="contentinfo"]')!.getBoundingClientRect().top
    );
    const offset =
      position === "start"
        ? bodyBox.top - top
        : position === "end"
          ? bodyBox.bottom - bottom + 1
          : bodyBox.top - top + (bodyBox.height - (bottom - top)) / 2;
    if (root) root.scrollTo({ top: root.scrollTop + offset, behavior: "instant" });
    else window.scrollTo({ top: window.scrollY + offset, behavior: "instant" });
  }, edge);
}
const progress = (page: Page) => page.getByRole("progressbar", { name: "正文阅读进度" });

interface ReadingFrameGate {
  advance: () => void;
  paint: () => Promise<void>;
  snapshot: () => { queued: number; scrollCalls: number };
  release: () => void;
}
declare global {
  interface Window {
    blogReadingFrames?: ReadingFrameGate;
  }
}

// Hold only this test page's frames, so a mutation can occur before either
// navigation frame without relying on machine speed or an arbitrary delay.
async function holdReadingFrames(page: Page) {
  await page.evaluate(() => {
    const request = window.requestAnimationFrame;
    const cancel = window.cancelAnimationFrame;
    const windowScroll = window.scrollTo;
    const elementScroll = HTMLElement.prototype.scrollTo;
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    let scrollCalls = 0;
    window.requestAnimationFrame = (callback) => {
      callbacks.set(--nextId, callback);
      return nextId;
    };
    window.cancelAnimationFrame = (id) => {
      if (callbacks.has(id)) callbacks.delete(id);
      else cancel.call(window, id);
    };
    window.scrollTo = function (options?: ScrollToOptions | number, y?: number) {
      scrollCalls += 1;
      Reflect.apply(
        windowScroll,
        window,
        typeof options === "number" ? [options, y ?? 0] : [options ?? {}]
      );
    };
    HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number, y?: number) {
      if (this.id === "content") scrollCalls += 1;
      Reflect.apply(
        elementScroll,
        this,
        typeof options === "number" ? [options, y ?? 0] : [options ?? {}]
      );
    };
    window.blogReadingFrames = {
      advance() {
        const batch = [...callbacks.entries()];
        for (const [id, callback] of batch) {
          if (!callbacks.delete(id)) continue;
          callback(performance.now());
        }
      },
      paint: () => new Promise<void>((resolve) => request.call(window, () => resolve())),
      snapshot: () => ({ queued: callbacks.size, scrollCalls }),
      release() {
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
        window.scrollTo = windowScroll;
        HTMLElement.prototype.scrollTo = elementScroll;
        for (const callback of callbacks.values()) request.call(window, callback);
        callbacks.clear();
        delete window.blogReadingFrames;
      },
    };
  });
}

// AC-2, AC-3, AC-4: both layout and scroll ownership must cover fractional widths.
test("分数像素容器断点没有目录或滚动根间隙", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto(`/blog/${ids[0]}`);
  await expect(progress(page)).toBeVisible();
  const container = page.locator(".blog-reading-instance > .content-container");
  const observations = [];
  try {
    for (const width of [1087.5, 1087.25, 1087.75, 1088, 1086]) {
      await container.evaluate((node, value) => {
        window.scrollTo({ top: 0, behavior: "instant" });
        document.querySelector("#content")!.scrollTo({ top: 0, behavior: "instant" });
        node.style.inlineSize = `${value}px`;
      }, width);
      await expect
        .poll(() => container.evaluate((node) => node.getBoundingClientRect().width))
        .toBeCloseTo(width, 1);
      await page.screenshot({ path: info.outputPath(`container-${width}.png`) });
      if (width < 1088) {
        await expect(page.locator(".blog-toc-compact")).toBeVisible();
        await expect(page.locator(".blog-toc-desktop")).toBeHidden();
        await expect(page.locator("#content")).toHaveCSS("overflow-y", "visible");
      } else {
        await expect(page.locator(".blog-toc-compact")).toBeHidden();
        await expect(page.locator(".blog-toc-desktop")).toBeVisible();
        await expect(page.locator("#content")).toHaveCSS("overflow-y", "auto");
      }
      await scrollReading(page, "middle");
      await expect
        .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
        .toBeCloseTo(50, 0);
      observations.push({ width, progress: await progress(page).getAttribute("aria-valuenow") });
    }
  } finally {
    await writeFile(
      info.outputPath("container-boundaries.json"),
      JSON.stringify(observations, null, 2)
    );
  }
});

// AC-1, AC-3, AC-6: the same instance must adopt the new root and its future resizes.
test("同一阅读实例替换正文根后重建目录与尺寸订阅", async ({ page }, info) => {
  await page.goto(`/blog/${ids[0]}`);
  await expect(progress(page)).toBeVisible();
  await page.locator("#blog-content").evaluate((body) => {
    body.closest<HTMLElement>(".blog-reading-instance")!.dataset.lifecycleInstance = "unchanged";
    const next = document.createElement("div");
    next.id = body.id;
    next.className = body.className;
    next.innerHTML = '<h2 id="替换后的章节">替换后的章节</h2><p>新的短正文。</p>';
    body.replaceWith(next);
  });
  await expect(progress(page)).toHaveCount(0);
  const toc = await openToc(page);
  await expect(toc.getByRole("link")).toHaveCount(1);
  await expect(toc.getByRole("link")).toHaveText(/替换后的章节/);
  await expect(page.locator(".blog-reading-instance")).toHaveAttribute(
    "data-lifecycle-instance",
    "unchanged"
  );
  await page.locator("#blog-content").evaluate((body) => {
    body.style.minHeight = "3000px";
  });
  await expect(progress(page)).toBeVisible();
  if (await page.getByRole("button", { name: /^本文目录/ }).isVisible())
    await page.getByRole("button", { name: /^本文目录/ }).click();
  await scrollReading(page, "middle");
  await expect
    .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
    .toBeCloseTo(50, 0);
  await page.screenshot({ path: info.outputPath("replaced-body-root.png") });
});

// AC-5, AC-6, AC-7: pending navigation cannot escape the live body/target lifecycle.
for (const mutation of ["root", "target"] as const) {
  for (const phase of ["first", "second"] as const) {
    test(`导航${phase === "first" ? "首帧前" : "两帧之间"}${mutation === "root" ? "替换正文根" : "移除目标"}不会执行旧回调`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/blog/${ids[0]}?lifecycle=${mutation}-${phase}`);
      await expect(progress(page)).toBeVisible();
      await openToc(page);
      const before = page.url();
      await holdReadingFrames(page);
      try {
        const checkpoint = await page.evaluate(
          ({ mutation, phase }) => {
            const body = document.querySelector<HTMLElement>("#blog-content")!;
            body.closest<HTMLElement>(".blog-reading-instance")!.dataset.lifecycleInstance =
              "unchanged";
            const links = [
              ...document.querySelectorAll<HTMLAnchorElement>(
                '.blog-toc-link[aria-label="层级 4，4 级标题"]'
              ),
            ];
            links.find((link) => link.getBoundingClientRect().height > 0)!.click();
            const afterClick = window.blogReadingFrames!.snapshot().queued;
            if (phase === "second") window.blogReadingFrames!.advance();
            const beforeMutation = window.blogReadingFrames!.snapshot().queued;
            const target = body.querySelector("h4")!;
            if (mutation === "root") {
              const next = document.createElement("div");
              next.id = body.id;
              next.className = body.className;
              const heading = document.createElement("h4");
              heading.id = target.id;
              heading.textContent = "替换后的同名章节";
              next.append(heading, document.createTextNode("新正文。"));
              body.replaceWith(next);
            } else target.remove();
            return { afterClick, beforeMutation };
          },
          { mutation, phase }
        );
        // Tool boundaries deliver MutationObserver microtasks between frames.
        // Preserve queued order: the second navigation frame may precede measure.
        for (let frame = 0; frame < 6; frame++) {
          await page.evaluate(async () => {
            window.blogReadingFrames!.advance();
            await window.blogReadingFrames!.paint();
          });
        }
        const evidence = await page.evaluate(() => ({
          ...window.blogReadingFrames!.snapshot(),
          url: location.href,
          headings: [
            ...document.querySelectorAll(
              "#blog-content h1,#blog-content h2,#blog-content h3,#blog-content h4,#blog-content h5,#blog-content h6"
            ),
          ].map((heading) => heading.textContent),
          focus: {
            tag: document.activeElement?.tagName,
            id: document.activeElement?.id,
            heading: /^H[1-6]$/.test(document.activeElement?.tagName ?? "")
              ? document.activeElement?.textContent
              : null,
          },
          instance:
            document.querySelector<HTMLElement>(".blog-reading-instance")?.dataset
              .lifecycleInstance,
        }));
        await writeFile(
          info.outputPath("lifecycle.json"),
          JSON.stringify({ checkpoint, ...evidence }, null, 2)
        );
        expect(checkpoint.afterClick).toBeGreaterThan(0);
        expect(checkpoint.beforeMutation).toBeGreaterThan(0);
        expect(page.url()).toBe(before);
        expect(evidence.scrollCalls).toBe(0);
        expect(evidence.queued).toBe(0);
        expect(evidence.instance).toBe("unchanged");
        expect(errors).toEqual([]);
        if (mutation === "root") {
          await expect(page.locator("#blog-content h4")).not.toBeFocused();
          await expect(progress(page)).toHaveCount(0);
        } else
          await expect(
            page.getByRole("link", { name: "层级 4，4 级标题", exact: true })
          ).toHaveCount(0);
      } finally {
        await page.evaluate(() => window.blogReadingFrames?.release());
      }
      if (mutation === "root") {
        const nav = await openToc(page);
        await expect(nav.getByRole("link")).toHaveCount(1);
        await nav.getByRole("link", { name: "替换后的同名章节，4 级标题", exact: true }).click();
        await expect(page.locator("#blog-content h4")).toBeFocused();
      }
      await page.screenshot({ path: info.outputPath("lifecycle-result.png") });
    });
  }
}

async function expectSettledHeading(page: Page, selector: string, summary: string, offset = 0) {
  let alignedSince = 0;
  const samples: { top: number; readingTop: number; summary: string | null }[] = [];
  try {
    await expect
      .poll(async () => {
        const sample = await page
          .locator(selector)
          .filter({ visible: true })
          .evaluate((heading) => ({
            top: heading.getBoundingClientRect().top,
            readingTop:
              document.querySelector(".navbar")!.getBoundingClientRect().bottom +
              document.querySelector("[data-reading-progress]")!.getBoundingClientRect().height,
            summary: document.querySelector(".blog-toc-compact button")?.textContent ?? null,
          }));
        samples.push(sample);
        if (Math.abs(sample.top - sample.readingTop - offset) <= 2 && sample.summary === summary) {
          alignedSince ||= Date.now();
          return Date.now() - alignedSince;
        }
        alignedSince = 0;
        return 0;
      })
      .toBeGreaterThanOrEqual(150);
  } finally {
    await writeFile(
      test.info().outputPath("settled-heading.json"),
      JSON.stringify(samples, null, 2)
    );
    await test.info().attach("settled-heading", {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
  }
}

// AC-2, AC-5, AC-6: TOC insertion and a wrapping current-section summary alter body position.
test("窄屏普通动效选择长标题后稳定对齐阅读线", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/blog/${ids[4]}`);
  await expect(progress(page)).toBeVisible();
  await page.getByRole("button", { name: /^本文目录/ }).click();
  await page
    .getByRole("link", { name: `${longHeading}，6 级标题` })
    .filter({ visible: true })
    .click();
  await expect(page.locator("#blog-content h6")).toBeFocused();
  await expectSettledHeading(page, "#blog-content h6", `本文目录：${longHeading}`);
});

// AC-1, AC-5, AC-6: a newly opened fragment waits for the compact directory layout.
test("窄屏首次片段等待目录出现后对齐正文同名标题", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/blog/${ids[5]}#${marker}-collision`);
  await expect(progress(page)).toBeVisible();
  await expectSettledHeading(page, "#blog-content h1", `本文目录：${marker}-collision`);
});

// AC-2, AC-4: a wrapping summary cannot displace ordinary forward/backward reading.
test("窄屏普通阅读跨越长摘要时保持正文位置", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/blog/${ids[4]}`);
  await expect(progress(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "本文目录", exact: true })).toBeVisible();
  await page.locator("#blog-content h6").evaluate((heading) => {
    const top =
      document.querySelector(".navbar")!.getBoundingClientRect().bottom +
      document.querySelector("[data-reading-progress]")!.getBoundingClientRect().height;
    window.scrollTo({
      top: window.scrollY + heading.getBoundingClientRect().top - top + 1,
      behavior: "instant",
    });
  });
  await expectSettledHeading(page, "#blog-content h6", `本文目录：${longHeading}`, -1);
  await page.evaluate(() => window.scrollTo({ top: window.scrollY - 120, behavior: "instant" }));
  await expectSettledHeading(page, "#blog-content h6", "本文目录：层级 5", 119);
});
async function openToc(page: Page) {
  const toggle = page.getByRole("button", { name: /^本文目录/ });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  return page.getByRole("navigation", { name: "本文目录" }).filter({ visible: true });
}

// spec 0013 AC-1 to AC-5, AC-8 to AC-10. All assertions use a real persisted article.
test("真实文章的正文进度、六级目录、四主题和键盘章节链接", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(
    info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 800 }
  );
  const response = await page.goto(`/blog/${ids[0]}?reading=test`);
  expect(await response!.text()).toContain('id="重复章节-1"');
  await expect(progress(page)).toBeVisible();
  const toc = await openToc(page);
  expect(await toc.getByRole("link").count()).toBe(9);
  await expect(toc.getByRole("link", { name: "层级 6，6 级标题" })).toHaveAttribute(
    "href",
    `/blog/${ids[0]}?reading=test#%E5%B1%82%E7%BA%A7-6`
  );
  if (info.project.name === "mobile") await page.getByRole("button", { name: /^本文目录/ }).click();
  for (const [edge, expected] of [
    ["start", 0],
    ["middle", 50],
    ["end", 100],
  ] as const) {
    await scrollReading(page, edge);
    await expect
      .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
      .toBeCloseTo(expected, 0);
  }
  await expect(page.locator('a[aria-current="location"]:visible')).toHaveCount(
    info.project.name === "mobile" ? 0 : 1
  );
  await scrollReading(page, "middle");
  await expect
    .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
    .toBeCloseTo(50, 0);
  for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
    await page.getByRole("radio", { name: theme, exact: true }).click();
    const nav = await openToc(page);
    const link = nav.getByRole("link").first();
    await expect(link).toHaveCSS(
      "color",
      await page.locator("#blog-content").evaluate((node) => getComputedStyle(node).color)
    );
    await page.screenshot({ path: info.outputPath(`reading-${theme}.png`) });
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: /^本文目录/ }).click();
  }
  const nav = await openToc(page);
  const length = await page.evaluate(() => {
    history.replaceState({ ...history.state, readingTest: "preserved" }, "");
    return history.length;
  });
  const destination = nav.getByRole("link", { name: "层级 4，4 级标题" });
  const keyboardPath = [];
  if (info.project.name === "mobile") {
    // The iPhone WebKit simulator skips even plain anchors with Tab and Alt+Tab.
    // Keep its Enter/focus contract; desktop and component tests cover natural traversal.
    await destination.focus();
  } else {
    await nav.getByRole("link").first().focus();
    for (let heading = 1; heading < 4; heading++) {
      await page.keyboard.press("Tab");
      keyboardPath.push(
        await page.evaluate(() => ({
          tag: document.activeElement?.tagName,
          label: document.activeElement?.getAttribute("aria-label"),
          href: document.activeElement?.getAttribute("href"),
        }))
      );
    }
  }
  await writeFile(info.outputPath("keyboard-path.json"), JSON.stringify(keyboardPath, null, 2));
  await expect(destination).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#blog-content h4")).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await page.evaluate(() => history.state.readingTest)).toBe("preserved");
  await expect(page).toHaveURL(new RegExp(`reading=test#%E5%B1%82%E7%BA%A7-4$`));
  if (info.project.name === "mobile")
    await expect(page.getByRole("button", { name: /^本文目录/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  await expect(page.locator("[data-reading-progress] .transition-all")).toHaveCSS(
    "transition-duration",
    "0s"
  );
  // The existing horizontally scrollable navbar is outside this Blog slice.
  expect(
    await page
      .locator(".blog-reading-instance")
      .evaluate((node) => node.getBoundingClientRect().width <= innerWidth)
  ).toBe(true);
  expect(
    await page.locator("#blog-content").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true);
  expect(errors).toEqual([]);
});

// AC-2, AC-4, AC-6, AC-7: root rebinding, local horizontal scroll and body mutations.
test("跨断点重绑定、动态正文重测及短文空文边界", async ({ page }, info) => {
  await page.goto(`/blog/${ids[0]}`);
  await expect(progress(page)).toBeVisible();
  for (const width of [1088, 1087, 1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await scrollReading(page, "middle");
    await expect
      .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
      .toBeCloseTo(50, 0);
    expect(await page.locator(".blog-toc-compact").isVisible()).toBe(width < 1088);
  }
  const horizontalSnapshot = () =>
    page.evaluate(() => {
      const box = document.querySelector("#blog-content")!.getBoundingClientRect();
      const top =
        document.querySelector(".navbar")!.getBoundingClientRect().bottom +
        document.querySelector("[data-reading-progress]")!.getBoundingClientRect().height;
      const bottom = Math.min(
        innerHeight,
        document.querySelector('[role="contentinfo"]')!.getBoundingClientRect().top
      );
      return {
        windowY: scrollY,
        contentY: document.querySelector("#content")!.scrollTop,
        bodyTop: box.top,
        bodyHeight: box.height,
        codeX: document.querySelector("pre")!.scrollLeft,
        value: Number(
          document.querySelector('[aria-label="正文阅读进度"]')!.getAttribute("aria-valuenow")
        ),
        expected: ((top - box.top) / (box.height - (bottom - top))) * 100,
      };
    });
  // A value near 50% can still precede the last resize measurement. Establish
  // a stable geometry-matched baseline before testing horizontal isolation.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let previousSample = "";
  await expect
    .poll(async () => {
      const sample = await horizontalSnapshot();
      const key = JSON.stringify(sample);
      const settled = key === previousSample && Math.abs(sample.value - sample.expected) < 1e-7;
      previousSample = key;
      return settled;
    })
    .toBe(true);
  const beforeHorizontal = await horizontalSnapshot();
  const previous = beforeHorizontal.value;
  await page.locator("pre").evaluate((node) => {
    node.scrollLeft = 100;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  const afterHorizontal = await horizontalSnapshot();
  await writeFile(
    info.outputPath("horizontal-scroll.json"),
    JSON.stringify({ previous, beforeHorizontal, afterHorizontal }, null, 2)
  );
  expect(afterHorizontal.codeX).toBeGreaterThan(beforeHorizontal.codeX);
  for (const key of ["windowY", "contentY", "bodyTop", "bodyHeight"] as const)
    expect(afterHorizontal[key]).toBe(beforeHorizontal[key]);
  await expect(progress(page)).toHaveAttribute("aria-valuenow", String(previous));
  await page.locator("#blog-content").evaluate((body) => {
    const p = document.createElement("p");
    p.textContent = "动态增高。".repeat(2500);
    body.append(p);
  });
  await expect
    .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
    .toBeLessThan(previous);
  await page.locator("#blog-content").evaluate((body) => {
    body.innerHTML = '<h6 id="新的六级标题">新的六级标题</h6><p>替换正文。</p>';
  });
  await expect(progress(page)).toHaveCount(0);
  const toc = await openToc(page);
  await expect(toc.getByRole("link")).toHaveCount(1);
  await expect(toc.getByRole("link")).toHaveText(/新的六级标题/);
  for (const [index, kind] of [
    [1, "short"],
    [2, "empty"],
    [3, "nohead"],
  ] as const) {
    await page.goto(`/blog/${ids[index]}#%broken`);
    const title = page.getByRole("heading", { name: `${marker}-${kind}`, exact: true });
    const article = page.locator("#blog-container").filter({ has: title });
    await expect(title).toBeVisible();
    await expect(article.locator("#blog-content")).toBeAttached();
    if (index === 3) {
      await expect(progress(page)).toBeVisible();
      await expect(page.getByRole("button", { name: /^本文目录/ })).toHaveCount(0);
    } else await expect(progress(page)).toHaveCount(0);
    if (index === 2) await expect(article.locator(".blog-toc-compact")).toHaveCount(0);
  }
});

// AC-5, AC-6: direct fragments position once; history follows the actual restored position.
test("编码章节链接、文章切换和原生历史位置", async ({ page }) => {
  await page.goto(`/blog/${ids[0]}#%E5%B1%82%E7%BA%A7-4`);
  await expect(progress(page)).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("#blog-content h4")
        .evaluate((node) =>
          Math.abs(
            node.getBoundingClientRect().top -
              (document.querySelector(".navbar")!.getBoundingClientRect().bottom +
                document.querySelector("[data-reading-progress]")!.getBoundingClientRect().height)
          )
        )
    )
    .toBeLessThanOrEqual(2);
  await scrollReading(page, "end");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "100");
  await page.goto(`/blog/${ids[1]}`);
  await expect(progress(page)).toHaveCount(0);
  await page.goBack();
  await expect(progress(page)).toBeVisible();
  const value = Number(await progress(page).getAttribute("aria-valuenow"));
  expect(Number.isFinite(value)).toBe(true);
  // Either native restoration succeeds or the rebuilt desktop root starts at its real top.
  const actual = await page.locator("#blog-content:visible").evaluate((body) => ({
    top: body.getBoundingClientRect().top,
    bottom: body.getBoundingClientRect().bottom,
  }));
  if (actual.bottom <= 844) expect(value).toBeGreaterThan(90);
  else if (actual.top > 64) expect(value).toBe(0);
  await page.goForward();
  await expect(page.locator("#blog-content:visible h1")).toHaveText("简短章节");
  await expect(progress(page)).toHaveCount(0);
});

// AC-5, AC-6: returning through Next respects the actual root without replaying the fragment.
test("通过 Next 链接离开文章再后退，不重复执行旧片段定位", async ({ page }) => {
  await page.goto(`/blog/${ids[0]}#%E5%B1%82%E7%BA%A7-4`);
  await expect(progress(page)).toBeVisible();
  await expectSettledHeading(page, "#blog-content h4", "本文目录：层级 4");
  await scrollReading(page, "end");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "100");
  await page.getByRole("link", { name: "BLOG", exact: true }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await page.evaluate(() => {
    document.documentElement.dataset.readingScrollCalls = "0";
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number, y?: number) {
      if (this.id === "content")
        document.documentElement.dataset.readingScrollCalls = String(
          Number(document.documentElement.dataset.readingScrollCalls) + 1
        );
      Reflect.apply(
        original,
        this,
        typeof options === "number" ? [options, y ?? 0] : [options ?? {}]
      );
    };
  });
  await page.goBack();
  await expect(progress(page)).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  expect(await page.locator("html").getAttribute("data-reading-scroll-calls")).toBe("0");
  // Native or Next restoration owns the actual position. The reader only measures it.
  const actual = await page.locator("#blog-content:visible").evaluate((body) => {
    const box = body.getBoundingClientRect();
    const top =
      document.querySelector(".navbar")!.getBoundingClientRect().bottom +
      document.querySelector("[data-reading-progress]")!.getBoundingClientRect().height;
    const bottom = Math.min(
      innerHeight,
      document.querySelector('[role="contentinfo"]')!.getBoundingClientRect().top
    );
    return Math.min(100, Math.max(0, ((top - box.top) / (box.height - (bottom - top))) * 100));
  });
  await expect
    .poll(async () => Number(await progress(page).getAttribute("aria-valuenow")))
    .toBeCloseTo(actual, 1);
});

// AC-9, AC-10: safe demo navigation must never alter Album route or query/hash.
test("Album 目录样例隔离路由，短文与空文不显示伪造进度", async ({ page }) => {
  await page.goto("/album?component=blog-reading");
  const initial = page.url();
  const sample = page.locator(".blog-reading-demo");
  await expect(sample).toBeVisible();
  await expect(
    sample.locator(".blog-toc-compact, .blog-toc-desktop").filter({ visible: true })
  ).toBeVisible();
  const toggle = sample.getByRole("button", { name: /^本文目录/ });
  if (await toggle.isVisible()) await toggle.click();
  await sample
    .getByRole("link", { name: "第 6 级章节，6 级标题" })
    .filter({ visible: true })
    .click();
  expect(page.url()).toBe(initial);
  await page.getByRole("button", { name: "短文", exact: true }).first().click();
  await expect(sample.getByRole("progressbar")).toHaveCount(0);
  await page.getByRole("button", { name: "空正文", exact: true }).first().click();
  await expect(sample.getByRole("navigation")).toHaveCount(0);
});
