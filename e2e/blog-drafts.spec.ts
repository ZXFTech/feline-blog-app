import { expect, test } from "@playwright/test";
import {
  isDraftFixtureEnabled,
  newDraftFixtureContext,
  openDraftFixtureDatabase,
  signInDraftFixture,
} from "./blog-draft-fixture";

test.skip(!isDraftFixtureEnabled, "需要独立的 SDK 草稿测试环境");
test.use({ trace: "off", actionTimeout: 10_000 });
test.setTimeout(120_000);

test("私有保存、跨页面恢复、冲突载入、提交与退出删除闭环", async ({ page, browser }, info) => {
  // spec 0016 covers: AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13.
  const author = await signInDraftFixture(page.context(), "author");
  const db = openDraftFixtureDatabase();
  const marker = `draft-e2e-${info.project.name}-${Date.now()}`;
  const content = `\n## ${marker}\n\nsoft line\nnext line\n\n\`\`\`ts\n  const exact = true;  \n\n\`\`\`\n`;
  const draftIds: string[] = [];
  const articleIds: number[] = [];
  const second = await newDraftFixtureContext(browser, {
    viewport: page.viewportSize() ?? undefined,
  });
  const anonymous = await newDraftFixtureContext(browser, {});
  try {
    expect(await signInDraftFixture(second, "author")).toEqual(author);
    await page.goto("/blog/new?extra=keep#editor");
    await page.getByRole("button", { name: "全屏", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "文章编辑器" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "全屏", exact: true })).toBeFocused();
    const baseline = await db.blogDraft.count({ where: { authorId: author.id } });
    await page.waitForTimeout(1100);
    expect(await db.blogDraft.count({ where: { authorId: author.id } })).toBe(baseline);
    await page.evaluate((value) => {
      window.history.replaceState({ ...window.history.state, editorSentinel: value }, "");
    }, marker);
    await page.getByLabel("文章标题", { exact: true }).fill(marker);
    await page.getByLabel("Markdown 正文", { exact: true }).dispatchEvent("compositionstart");
    await page.getByLabel("Markdown 正文", { exact: true }).fill(content);
    await expect(page.getByRole("button", { name: "提交", exact: true })).toBeDisabled();
    // Stay in composition beyond the debounce, with no draft created from a partial value.
    await page.waitForTimeout(1100);
    expect(await db.blogDraft.count({ where: { authorId: author.id } })).toBe(baseline);
    await page.getByLabel("Markdown 正文", { exact: true }).dispatchEvent("compositionend");
    await page.getByRole("button", { name: "编辑标签", exact: true }).click();
    await page.getByLabel("标签名称").fill(`${marker}-默认`);
    await page.getByRole("button", { name: "确认标签", exact: true }).click();
    await page.getByLabel("标签名称").fill(`${marker}-蓝色`);
    await page.getByRole("button", { name: "选择标签颜色", exact: true }).click();
    const blue = page.getByRole("button", { name: "选择 blue-500 颜色", exact: true });
    // Being in the DOM is insufficient: centered overflow used to clip this row.
    expect(
      await blue.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        );
      })
    ).toBe(true);
    await blue.click();
    await page.getByLabel("标签名称").click();
    await page.getByRole("button", { name: "确认标签", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    const draftId = new URL(page.url()).searchParams.get("draft")!;
    draftIds.push(draftId);
    expect(new URL(page.url()).searchParams.get("extra")).toBe("keep");
    expect(new URL(page.url()).hash).toBe("#editor");
    expect(await page.evaluate(() => window.history.state.editorSentinel)).toBe(marker);
    expect(await db.blog.count({ where: { authorId: author.id, title: marker } })).toBe(0);
    const privateProbe = await anonymous.request.get("/api/blog?content=" + marker);
    expect(privateProbe.ok()).toBe(true);
    expect(await privateProbe.text()).not.toContain(marker);
    expect((await db.blogDraft.findUniqueOrThrow({ where: { id: draftId } })).content).toBe(
      content
    );
    const saved = await db.blogDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(saved.tags).toEqual([
      { content: `${marker}-默认`, color: "currentColor" },
      { content: `${marker}-蓝色`, color: "oklch(62.3% 0.214 259.815)" },
    ]);
    await page.getByLabel("Markdown 正文", { exact: true }).fill("x".repeat(1_100_000));
    await expect(page.getByText(/草稿请求超过 1 MB/)).toBeVisible();
    expect((await db.blogDraft.findUniqueOrThrow({ where: { id: draftId } })).revision).toBe(
      saved.revision
    );
    await page.getByLabel("Markdown 正文", { exact: true }).fill(content);
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Markdown 正文", { exact: true })).toHaveValue(content);
    const other = await second.newPage();
    await other.goto(`/blog/new?draft=${draftId}`);
    await expect(other.getByLabel("Markdown 正文", { exact: true })).toHaveValue(content);
    const latest = `${content}\n## 最新工作副本\n\n${marker}`;
    await page.getByLabel("Markdown 正文", { exact: true }).fill(latest);
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    await other.getByLabel("Markdown 正文", { exact: true }).fill("本页发生冲突时要保留的原文");
    await expect(
      other.getByText("草稿已在其他位置更新或删除，已停止自动保存", { exact: true })
    ).toBeVisible();
    await expect(other.getByLabel("Markdown 正文", { exact: true })).toHaveValue(
      "本页发生冲突时要保留的原文"
    );
    await other.getByRole("button", { name: "全屏", exact: true }).click();
    await other.getByRole("button", { name: "载入最新草稿", exact: true }).click();
    await expect(other.getByRole("alertdialog")).toBeVisible();
    await other.keyboard.press("Escape");
    await expect(other.getByRole("alertdialog")).toHaveCount(0);
    await expect(other.getByRole("dialog", { name: "文章编辑器", exact: true })).toBeVisible();
    await expect(other.getByLabel("Markdown 正文", { exact: true })).toHaveValue(
      "本页发生冲突时要保留的原文"
    );
    await other.getByRole("button", { name: "载入最新草稿", exact: true }).click();
    await other.getByRole("button", { name: "放弃本页并载入", exact: true }).click();
    await expect(other.getByLabel("Markdown 正文", { exact: true })).toHaveValue(latest);
    await other.screenshot({ path: info.outputPath("conflict-recovered-fullscreen.png") });
    await other.getByRole("button", { name: "提交", exact: true }).click();
    await expect(other).toHaveURL(/\/blog\/\d+$/, { timeout: 30_000 });
    const blogId = Number(new URL(other.url()).pathname.split("/").at(-1));
    articleIds.push(blogId);
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`/blog/${blogId}`);
    await expect(
      publicPage.getByRole("heading", { name: "最新工作副本", exact: true })
    ).toBeVisible();
    expect((await db.blog.findUniqueOrThrow({ where: { id: blogId } })).content).toBe(latest);
    const publishedProbe = await anonymous.request.get("/api/blog?content=" + marker);
    expect(publishedProbe.ok()).toBe(true);
    expect(await publishedProbe.text()).toContain(marker);
    await page.goto(`/blog/edit/${blogId}`);
    await expect(page.getByLabel("Markdown 正文", { exact: true })).toHaveValue(latest);
    const unpublished = `${latest}\n\n未公开修改 ${marker}`;
    await page.getByLabel("Markdown 正文", { exact: true }).fill(unpublished);
    // Explicit exit flushes the latest input without waiting for the debounce timer.
    await page.getByRole("link", { name: "退出编辑", exact: true }).click();
    await expect(page).toHaveURL("/blog/drafts", { timeout: 30_000 });
    const row = page.locator(`[data-draft-id="${draftId}"]`);
    await expect(row.getByText(marker, { exact: true })).toBeVisible();
    expect((await db.blog.findUniqueOrThrow({ where: { id: blogId } })).content).toBe(latest);
    await row.getByRole("button", { name: "删除草稿", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("已发布文章会继续保留");
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await db.blog.findUniqueOrThrow({ where: { id: blogId } })).content).toBe(latest);
    await page.screenshot({ path: info.outputPath("drafts-after-delete.png") });
  } finally {
    await second.close().catch(() => {});
    await anonymous.close().catch(() => {});
    const articles = await db.blog.findMany({
      where: { authorId: author.id, OR: [{ title: marker }, { id: { in: articleIds } }] },
      select: { id: true },
    });
    const ids = articles.map((article) => article.id);
    await db.tagsOnBlogs.deleteMany({ where: { blogId: { in: ids } } });
    await db.blog.deleteMany({ where: { authorId: author.id, id: { in: ids } } });
    await db.blogDraft.deleteMany({
      where: { authorId: author.id, OR: [{ id: { in: draftIds } }, { title: marker }] },
    });
    await db.blogPublishReceipt.deleteMany({ where: { authorId: author.id, blogId: { in: ids } } });
    await db.tag.deleteMany({
      where: { userId: author.id, content: { in: [`${marker}-默认`, `${marker}-蓝色`] } },
    });
    await db.$disconnect();
  }
});

test("会话失效保留本页内容，重新登录后显式重试才保存", async ({ page }, info) => {
  // spec 0016 covers: AC-6, AC-11, AC-13. Revoke the isolated SDK session server-side.
  const author = await signInDraftFixture(page.context(), "author");
  const db = openDraftFixtureDatabase();
  const marker = `session-e2e-${info.project.name}-${Date.now()}`;
  try {
    await page.goto("/blog");
    await page.getByRole("button", { name: "我的草稿", exact: true }).click();
    await expect(page).toHaveURL("/blog/drafts");
    await page.getByRole("link", { name: "新建文章", exact: true }).click();
    const input = page.getByLabel("Markdown 正文", { exact: true });
    await page.getByLabel("文章标题", { exact: true }).fill(marker);
    await input.fill("已保存的正文");
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    const draftId = new URL(page.url()).searchParams.get("draft")!;
    const before = await db.blogDraft.findUniqueOrThrow({ where: { id: draftId } });
    let automaticRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) automaticRequests++;
    });
    expect((await db.session.deleteMany({ where: { userId: author.id } })).count).toBeGreaterThan(
      0
    );
    await input.fill("会话失效时仍在本页的正文");
    await expect(page.getByRole("link", { name: "在新标签页重新登录", exact: true })).toBeVisible();
    const latest = "\n  重新登录前继续输入的原文  \n";
    await input.fill(latest);
    // Observe longer than the specified 1000 ms debounce to prove failure does not loop.
    await page.waitForTimeout(1300);
    expect(automaticRequests).toBe(1);
    await expect(input).toHaveValue(latest);
    expect((await db.blogDraft.findUniqueOrThrow({ where: { id: draftId } })).revision).toBe(
      before.revision
    );
    expect(await signInDraftFixture(page.context(), "author")).toEqual(author);
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    const after = await db.blogDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(after.content).toBe(latest);
    expect(after.revision).toBe(before.revision + 1);
    expect(await db.blog.count({ where: { authorId: author.id, title: marker } })).toBe(0);
  } finally {
    await db.blogDraft.deleteMany({ where: { authorId: author.id, title: marker } });
    await db.$disconnect();
  }
});

test("原生离开提示保护保存中的正文，服务器确认后不再提示", async ({
  page,
  browserName,
  isMobile,
}, info) => {
  // spec 0016 covers: AC-4, AC-5, AC-10. Mobile browsers need not expose beforeunload dialogs.
  test.skip(
    browserName !== "chromium" || isMobile,
    "原生 beforeunload 对话框仅在支持的桌面 Chromium 验证"
  );
  const author = await signInDraftFixture(page.context(), "author");
  const db = openDraftFixtureDatabase();
  const marker = `unload-e2e-${info.project.name}-${Date.now()}`;
  const raw = "\n  保存中也不能丢失的原文  \n";
  let release!: () => void;
  const heldResponse = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  try {
    await page.goto("/blog/new");
    await page.route("**/blog/new**", async (route) => {
      const request = route.request();
      if (held || request.method() !== "POST" || !request.headers()["next-action"]) {
        await route.continue();
        return;
      }
      held = true;
      const response = await route.fetch();
      await heldResponse;
      await route.fulfill({ response });
    });
    await page.getByLabel("文章标题", { exact: true }).fill(marker);
    await page.getByLabel("Markdown 正文", { exact: true }).fill(raw);
    await expect(page.getByRole("status").filter({ hasText: "正在保存草稿…" })).toBeVisible();
    const dialogPromise = page.waitForEvent("dialog");
    const attempt = page.evaluate(() => window.location.reload());
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    await attempt;
    await expect(page.getByLabel("Markdown 正文", { exact: true })).toHaveValue(raw);
    release();
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    const unexpectedDialogs: string[] = [];
    page.on("dialog", async (next) => {
      unexpectedDialogs.push(next.type());
      await next.accept();
    });
    await page.reload();
    await expect(page.getByLabel("Markdown 正文", { exact: true })).toHaveValue(raw);
    expect(unexpectedDialogs).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await db.blogDraft.deleteMany({ where: { authorId: author.id, title: marker } });
    await db.$disconnect();
  }
});

test("匿名访问作者页面时不能取得私有编辑表单", async ({ browser }) => {
  // spec 0016 covers: AC-2, AC-13. Async Server Components are exercised in the real app.
  const anonymous = await newDraftFixtureContext(browser, {});
  try {
    const page = await anonymous.newPage();
    for (const route of ["/blog/new", "/blog/drafts", "/blog/edit/1"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await expect(page.getByLabel("文章标题", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Markdown 正文", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "我的草稿", exact: true })).toHaveCount(0);
    }
  } finally {
    await anonymous.close();
  }
});

test("草稿仅对所属作者可见，普通读者不能打开作者页面", async ({ page, browser }, info) => {
  const author = await signInDraftFixture(page.context(), "author");
  const db = openDraftFixtureDatabase();
  const title = `isolation-e2e-${info.project.name}-${Date.now()}`;
  const other = await newDraftFixtureContext(browser, {});
  const reader = await newDraftFixtureContext(browser, {});
  try {
    await page.goto("/blog/new");
    await page.getByLabel("文章标题", { exact: true }).fill(title);
    await expect(page.getByRole("status").filter({ hasText: "草稿已保存" })).toBeVisible();
    const draftId = new URL(page.url()).searchParams.get("draft");
    expect(draftId).toBeTruthy();

    expect(await signInDraftFixture(other, "other")).not.toEqual(author);
    const otherPage = await other.newPage();
    await otherPage.goto("/blog/drafts");
    await expect(otherPage.getByText(title, { exact: true })).toHaveCount(0);
    await otherPage.goto(`/blog/new?draft=${draftId}`);
    await expect(otherPage.getByRole("heading", { name: "暂时无法打开草稿" })).toBeVisible();
    await expect(otherPage.getByLabel("文章标题", { exact: true })).toHaveCount(0);

    await signInDraftFixture(reader, "reader");
    const readerPage = await reader.newPage();
    for (const route of ["/blog/drafts", `/blog/new?draft=${draftId}`]) {
      await readerPage.goto(route);
      await expect(readerPage.getByRole("heading", { name: "没有文章编辑权限" })).toBeVisible();
      await expect(readerPage.getByText(title, { exact: true })).toHaveCount(0);
    }
  } finally {
    await Promise.all([other.close(), reader.close()]);
    await db.blogDraft.deleteMany({ where: { authorId: author.id, title } });
    await db.$disconnect();
  }
});
