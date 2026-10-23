import { expect, test } from "@playwright/test";
import db from "@/db/postgres/runtime";

test.setTimeout(90_000);
test.use({ trace: "off" });

test("Blog 搜索与排序合并提交，清除和历史导航不重放草稿", async ({ page }) => {
  const marker = `no-match-${Date.now()}`;
  await page.goto(`/blog?content=${marker}&orderBy=asc&extra=keep#context`);
  await page.waitForLoadState("networkidle");
  const search = page.getByRole("textbox", { name: "搜索正文" });
  await expect(page.getByRole("heading", { name: "文章", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "没有找到匹配的文章" })).toBeVisible();
  await expect(search).toHaveValue(marker);
  await search.fill(`${marker}-draft`);
  await page.getByRole("button", { name: "按时间倒序", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`content=${marker}-draft&orderBy=desc&extra=keep#context$`)
  );
  await expect(page.getByText(/正文包含/)).toContainText(`${marker}-draft`);
  await search.fill(`${marker}-late`);
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(page).toHaveURL(/\/blog\?orderBy=desc&extra=keep#context$/);
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  // Push an actual history entry, then leave with an input timer pending.
  await page.evaluate(() =>
    history.pushState(null, "", "/blog?content=history-target&orderBy=asc")
  );
  await expect(search).toHaveValue("history-target");
  await search.fill("uncommitted-history-draft");
  await page.goBack();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "按时间正序" })).toBeVisible();
  await page.goForward();
  await expect(search).toHaveValue("history-target");
  await expect(page).toHaveURL(/content=history-target&orderBy=asc$/);
});

test("Blog 清除搜索返回已缓存地址时只保留一个片段", async ({ page }) => {
  const initialUrl = "/blog?orderBy=asc&extra=keep#preserved-section";
  const marker = `cached-search-${Date.now()}`;
  await page.goto(initialUrl);
  await page.waitForLoadState("networkidle");
  const search = page.getByRole("textbox", { name: "搜索正文" });
  await search.fill(marker);
  await expect(page).toHaveURL(
    new RegExp(`orderBy=asc&extra=keep&content=${marker}#preserved-section$`)
  );
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(page).toHaveURL(initialUrl);
  await expect(search).toHaveValue("");
});

test("Blog 文字缺页和安全 Album 在四主题与键盘下可恢复", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/blog/not-a-valid-id?extra=keep#missing");
  const before = page.url();
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.getByText("文章不存在或已删除")).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.locator("#blog-content, .blog-toc-desktop, .blog-empty-image")).toHaveCount(0);
  const recheck = page.getByRole("button", { name: "重新检查" });
  await recheck.focus();
  await page.keyboard.press("Enter");
  await expect(recheck).toBeEnabled();
  expect(page.url()).toBe(before);
  for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
    await page.getByRole("radio", { name: theme, exact: true }).click();
    await expect(page.getByRole("link", { name: "返回文章列表" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: info.outputPath(`404-${theme}.png`) });
  }
  await page.waitForLoadState("networkidle");
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() !== "GET" ||
      url.pathname.startsWith("/blog") ||
      url.pathname === "/api/auth/me"
    )
      requests.push(url.pathname);
  });
  await page.goto("/album?component=blog-status");
  await expect(
    page.getByRole("heading", { name: "Blog 空状态与错误恢复", exact: true })
  ).toBeVisible();
  const current = page.getByRole("region", { name: "Blog 状态本地演示", exact: true });
  await current.getByRole("button", { name: "相邻失败", exact: true }).click();
  await expect(current.getByText("暂时无法读取相邻文章")).toBeVisible();
  await current.getByRole("button", { name: "重试", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(current.getByRole("link", { name: /更早：固定本地文章/ })).toBeVisible();
  await current.getByRole("link", { name: /更早：固定本地文章/ }).click();
  await expect(current.getByText("已记录导航意图：/blog/1")).toBeVisible();
  await current.getByRole("button", { name: "读取失败", exact: true }).click();
  await current.getByRole("button", { name: "重试", exact: true }).click();
  await expect(current.getByText("本地读取已恢复")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/album");
  expect(requests).toEqual([]);
  await page.screenshot({ path: info.outputPath("album-recovered.png") });
});

const target = process.env.POSTGRES_DATABASE_URL
  ? new URL(process.env.POSTGRES_DATABASE_URL)
  : null;
const safeLocal =
  target &&
  ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) &&
  target.pathname === "/feline_blog_dev" &&
  process.env.POSTGRES_ENVIRONMENT === "local";

test.describe("Blog 真实文章状态", () => {
  test.skip(
    !safeLocal || !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "需要安全本地 PostgreSQL 和测试账号"
  );
  let ids: number[] = [];
  let authorId = "";
  let marker = "";
  test.beforeAll(async ({}, info) => {
    const author = await db.user.findUnique({
      where: { email: process.env.E2E_USER_EMAIL!.toLowerCase() },
      select: { id: true, role: true },
    });
    expect(author?.role).toBe("ROOT");
    if (!author) throw new Error("安全测试作者不存在");
    authorId = author.id;
    marker = `blog-status-${info.project.name}-${Date.now()}`;
    for (const [content, deleted] of [
      ["", false],
      [" \n\t", false],
      ["已删除文章", true],
      ["# 可读正文\n\n保留真实内容。", false],
    ] as const) {
      const blog = await db.blog.create({
        data: { authorId, title: `${marker}-${ids.length}`, content, delete: deleted },
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

  test("客户端进入缺页后，重新检查能显示同一地址恢复的文章", async ({ page }, info) => {
    const id = ids[3];
    await page.goto("/blog");
    await page.waitForLoadState("networkidle");
    const entry = page.getByRole("link", { name: new RegExp(`${marker}-3`) });
    await expect(entry).toBeVisible();
    await db.blog.update({ where: { id, authorId }, data: { delete: true } });
    try {
      await entry.click();
      await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
      const target = `/blog/${id}?extra=recheck#preserved`;
      await page.evaluate((url) => history.replaceState(null, "", url), target);
      const address = page.url();

      await db.blog.update({ where: { id, authorId }, data: { delete: false } });
      await page.getByRole("button", { name: "重新检查", exact: true }).focus();
      await page.keyboard.press("Enter");

      await expect(page.getByRole("heading", { name: `${marker}-3`, exact: true })).toBeVisible();
      await expect(page.locator("#blog-content")).toContainText("保留真实内容");
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
      expect(page.url()).toBe(address);
      await page.screenshot({ path: info.outputPath("404-recheck-restored.png") });
    } finally {
      await db.blog.update({ where: { id, authorId }, data: { delete: false } });
    }
  });

  test("空白正文保留身份、互动与原始正文，软删除进入缺页", async ({ page }) => {
    for (const id of ids.slice(0, 2)) {
      await page.goto(`/blog/${id}`);
      const title = page.getByRole("heading", {
        name: `${marker}-${ids.indexOf(id)}`,
        exact: true,
      });
      // The previous article can still be hidden during a route transition.
      const article = page.locator("#blog-container").filter({ has: title });
      await expect(title).toBeVisible();
      await expect(article.getByText("这是一篇空文章", { exact: true })).toBeVisible();
      await expect(article.locator("#blog-content")).toHaveCount(1);
      await expect(article.locator("#blog-content")).not.toContainText("这是一篇空文章");
      await expect(page.getByRole("progressbar", { name: "正文阅读进度" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^本文目录/ })).toHaveCount(0);
      await expect(article.getByRole("heading", { name: "相邻文章", exact: true })).toBeVisible();
    }
    for (const id of [ids[2], 2147483647]) {
      await page.goto(`/blog/${id}`);
      await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    }
  });

  test("相邻导航传输拒绝只影响局部，网络恢复后手动重试", async ({ page }) => {
    const id = ids[3];
    let rejected = 0;
    await page.route(`**/blog/${id}`, async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        rejected++;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.goto(`/blog/${id}`);
    await expect(page.getByText("暂时无法读取相邻文章")).toBeVisible();
    await expect(page.locator("#blog-content")).toContainText("保留真实内容");
    await expect(page.getByText(/没有更早的文章|没有更新的文章/)).toHaveCount(0);
    // Development StrictMode may mount the reader twice. No user retry has occurred.
    expect(rejected).toBeGreaterThanOrEqual(1);
    await page.unroute(`**/blog/${id}`);
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByText("相邻文章已更新", { exact: true })).toBeVisible();
    await expect(page.locator("#blog-content")).toContainText("保留真实内容");
  });

  for (const movedFocus of [false, true]) {
    // covers: spec 0014 AC-6, AC-7, AC-9, AC-10, AC-12.
    // The initial error is a transport rejection. The retry reads real data.
    test(`相邻导航等待时${movedFocus ? "移走焦点后不抢回" : "保留焦点并回到标题"}，长标题在四主题可读`, async ({
      page,
    }, info) => {
      await page.setViewportSize(
        info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 800 }
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      const id = ids[3];
      const current = await db.blog.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true },
      });
      const longTitle = `${marker}-长标题-${"很长的相邻文章标题".repeat(16)}`;
      const neighbor = await db.blog.create({
        data: {
          authorId,
          title: longTitle,
          content: "安全本地相邻样例",
          createdAt: new Date(current.createdAt.getTime() + 1),
        },
        select: { id: true },
      });
      let reject = true;
      let retryReads = 0;
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pattern = `**/blog/${id}**`;
      try {
        await page.route(pattern, async (route) => {
          const request = route.request();
          if (
            new URL(request.url()).pathname !== `/blog/${id}` ||
            request.method() !== "POST" ||
            !request.headers()["next-action"]
          ) {
            await route.continue();
          } else if (reject) {
            await route.abort("failed");
          } else {
            retryReads++;
            const response = await route.fetch();
            await held;
            await route.fulfill({ response });
          }
        });
        await page.goto(`/blog/${id}?extra=adjacent#body`);
        await expect(page.getByText("暂时无法读取相邻文章", { exact: true })).toBeVisible();
        await expect(page.locator("#blog-content")).toContainText("保留真实内容");
        await expect(page.getByText(/没有更早的文章|没有更新的文章|暂无其他文章/)).toHaveCount(0);
        await page.waitForLoadState("networkidle");
        const address = page.url();
        reject = false;

        await page.getByRole("button", { name: "重试", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect.poll(() => retryReads).toBe(1);
        await expect(page.getByRole("button", { name: "正在重试…", exact: true })).toHaveAttribute(
          "aria-disabled",
          "true"
        );
        await expect(page.locator('[aria-label="相邻文章"]')).toHaveAttribute("aria-busy", "true");
        await expect(page.getByText("正在重试相邻文章…", { exact: true })).toBeVisible();
        await page.keyboard.press("Enter");
        if (movedFocus) {
          const otherControl = page.getByRole("radio", { name: "Light", exact: true });
          await otherControl.focus();
          await page.keyboard.press("Space");
          await expect(otherControl).toBeFocused();
        }
        const scrollBefore = await page.evaluate(() => scrollY);
        release();

        const link = page.getByRole("link", { name: `更新：${longTitle}`, exact: true });
        await expect(link).toBeVisible();
        await expect(page.getByText("相邻文章已更新", { exact: true })).toBeVisible();
        await expect(page.locator('[aria-label="相邻文章"]')).toHaveAttribute("aria-busy", "false");
        await expect(
          movedFocus
            ? page.getByRole("radio", { name: "Light", exact: true })
            : page.getByRole("heading", { name: "相邻文章", exact: true })
        ).toBeFocused();
        expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
        expect(retryReads).toBe(1);
        expect(page.url()).toBe(address);
        await expect(page.locator("#blog-content")).toContainText("保留真实内容");

        for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
          await page.getByRole("radio", { name: theme, exact: true }).click();
          await link.scrollIntoViewIfNeeded();
          expect(await link.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
            true
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          await page.screenshot({ path: info.outputPath(`adjacent-long-${theme}.png`) });
        }
      } finally {
        release();
        await page.unroute(pattern);
        await db.blog.deleteMany({ where: { id: neighbor.id, authorId, title: longTitle } });
      }
    });
  }
});
