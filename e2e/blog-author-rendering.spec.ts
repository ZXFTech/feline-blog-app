import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";

import db from "../src/db/postgres/runtime";
import { blogMarkdownSample } from "../src/app/album/_components/fixtures/blog-markdown";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};
const configuredTarget = process.env.POSTGRES_DATABASE_URL;
const target = configuredTarget ? new URL(configuredTarget) : null;
const localTarget =
  target &&
  ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
  target.pathname === "/feline_blog_dev" &&
  process.env.POSTGRES_ENVIRONMENT === "local";

test.skip(!account.email || !account.password, "需要安全测试账号");
test.skip(!localTarget || !process.env.JWT_SECRET, "需要安全本地 PostgreSQL 与现有 JWT 配置");
// Login requests contain credentials. Keep them out of retained traces.
test.use({ trace: "off" });
test.setTimeout(90_000);

async function contentSnapshot(root: Locator) {
  return root.evaluate((element) => ({
    typography: {
      font: getComputedStyle(element).fontFamily,
      size: getComputedStyle(element).fontSize,
      leading: getComputedStyle(element).lineHeight,
    },
    headings: Array.from(element.querySelectorAll("h1,h2,h3,h4,h5,h6"), (node) => ({
      level: node.tagName,
      id: node.id,
      text: node.textContent,
      paddingTop: getComputedStyle(node).paddingTop,
      paddingBottom: getComputedStyle(node).paddingBottom,
    })),
    paragraphs: Array.from(element.querySelectorAll("p"), (node) => node.textContent),
    lists: Array.from(element.querySelectorAll("ul,ol"), (node) => ({
      kind: node.tagName,
      text: node.textContent,
    })),
    tasks: Array.from(element.querySelectorAll('input[type="checkbox"]'), (node) => ({
      checked: node instanceof HTMLInputElement && node.checked,
      disabled: node.hasAttribute("disabled"),
    })),
    tables: Array.from(element.querySelectorAll("table"), (node) => node.textContent),
    links: Array.from(element.querySelectorAll("a"), (node) => ({
      href: node.getAttribute("href"),
      text: node.textContent,
    })),
    images: Array.from(element.querySelectorAll("img"), (node) => ({
      src: node.getAttribute("src"),
      alt: node.getAttribute("alt"),
    })),
    codes: Array.from(element.querySelectorAll("pre > code"), (node) => node.textContent),
    languages: Array.from(
      element.querySelectorAll(".blog-code-language"),
      (node) => node.textContent
    ),
  }));
}

test.afterAll(async () => {
  await db.$disconnect();
});

// covers: AC-2, AC-4, AC-6, AC-10, AC-11, AC-13. Uses only the guarded local DB.
test("作者预览、提交、公开服务端正文与编辑重读保持一致", async ({ page, browser }, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 800 }
  );
  const author = await db.user.findUnique({
    where: { email: account.email.toLowerCase() },
    select: { id: true, role: true },
  });
  expect(author?.role).toBe("ROOT");
  if (!author) throw new Error("安全测试作者不存在");
  const marker = `blog-render-${testInfo.project.name}-${Date.now()}`;
  const initialContent = `${blogMarkdownSample}\n\n## 重复锚点\n\n## 重复锚点\n`;
  let blogId: number | undefined;
  let submittedContent: string | undefined;
  const anonymous = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const login = await page.request.post("/api/auth/login", { data: account });
    expect(login.status()).toBe(200);
    await page.goto("/blog/new");
    await expect(page).toHaveURL(/\/blog\/new$/);
    // SSR inputs may become visible before the editor has hydrated in WebKit.
    // Confirm an actual editor interaction before entering author data.
    await page.getByRole("button", { name: /预览/, exact: false }).click();
    await expect(page.getByRole("button", { name: /关闭预览/ })).toBeVisible();
    await page.getByRole("button", { name: /关闭预览/ }).click();
    await page.getByPlaceholder("无标题").fill(marker);
    const input = page.getByPlaceholder("输入 Markdown 内容...");
    await input.fill(initialContent);
    const actualInput = await input.inputValue();
    submittedContent = actualInput;
    await page.getByRole("button", { name: /预览/, exact: false }).click();
    const preview = page.locator(".preview-part .blog-markdown");
    await expect(preview).toBeVisible();
    await expect(page.getByPlaceholder("无标题")).toHaveValue(marker);
    const previewContent = await contentSnapshot(preview);
    expect(previewContent.headings.slice(-2).map((heading) => heading.id)).toEqual([
      "重复锚点",
      "重复锚点-1",
    ]);
    expect(previewContent.codes.length).toBeGreaterThanOrEqual(5);
    await page.getByRole("button", { name: /提交/ }).click();
    await expect(page).toHaveURL(/\/blog\/\d+$/, { timeout: 30_000 });
    blogId = Number(new URL(page.url()).pathname.split("/").at(-1));
    expect(Number.isSafeInteger(blogId)).toBe(true);
    const stored = await db.blog.findFirst({
      where: { id: blogId, authorId: author.id, title: marker },
      select: { content: true },
    });
    expect(stored?.content).toBe(actualInput);
    expect(await contentSnapshot(page.locator("#blog-content"))).toEqual(previewContent);

    const publicPage = await anonymous.newPage();
    const pageErrors: string[] = [];
    publicPage.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await publicPage.goto(`/blog/${blogId}`);
    expect(response?.status()).toBe(200);
    const initialHtml = await response!.text();
    const titleGap = await publicPage.locator(".blog-article-title").evaluate((element) => {
      return (
        element.nextElementSibling!.getBoundingClientRect().top -
        element.getBoundingClientRect().bottom
      );
    });
    expect(titleGap).toBeCloseTo(8);
    expect(initialHtml).toContain('id="blog-content"');
    expect(initialHtml).toContain('id="重复锚点-1"');
    expect(await contentSnapshot(publicPage.locator("#blog-content"))).toEqual(previewContent);
    await expect(publicPage.locator("pre pre, pre button, [node]")).toHaveCount(0);
    await expect(publicPage.getByText("test", { exact: true })).toHaveCount(0);
    for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
      await publicPage.getByRole("radio", { name: theme, exact: true }).click();
      expect(await contentSnapshot(publicPage.locator("#blog-content"))).toEqual(previewContent);
    }
    expect(pageErrors).toEqual([]);
    await publicPage.screenshot({ path: testInfo.outputPath("public-article.png") });

    await page.goto(`/blog/edit/${blogId}`);
    await expect(input).toHaveValue(actualInput);
    await input.fill(`${actualInput}\n\n## 编辑后重读\n\n已更新的安全测试内容。`);
    const updatedInput = await input.inputValue();
    submittedContent = updatedInput;
    await page.getByRole("button", { name: /预览/, exact: false }).click();
    const updatedPreview = await contentSnapshot(preview);
    await page.getByRole("button", { name: /提交/ }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${blogId}$`), { timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (
            await db.blog.findFirst({
              where: { id: blogId, authorId: author.id, title: marker },
              select: { content: true },
            })
          )?.content,
        { timeout: 30_000 }
      )
      .toBe(updatedInput);
    await publicPage.reload();
    await expect
      .poll(() => contentSnapshot(publicPage.locator("#blog-content")))
      .toEqual(updatedPreview);
    await writeFile(
      testInfo.outputPath("author-flow.json"),
      JSON.stringify(
        {
          blogId,
          path: `/blog/${blogId}`,
          project: testInfo.project.name,
          previewMatchesPersistedInput: true,
          publicMatchesPreview: true,
          serverHtmlContainsBody: true,
          editedContentMatchesPreview: true,
        },
        null,
        2
      )
    );
  } finally {
    await anonymous.close();
    // This marker and author identify only this run's disposable article, even
    // when a submission succeeded before its redirect could be observed.
    const cleanupWhere = {
      authorId: author.id,
      OR: [
        { title: marker },
        ...(blogId && submittedContent !== undefined
          ? [{ id: blogId, content: submittedContent }]
          : []),
      ],
    };
    const rows = await db.blog.findMany({
      where: cleanupWhere,
      select: { id: true },
    });
    if (rows.length) {
      const ids = rows.map((row) => row.id);
      await db.$transaction([
        db.tagsOnBlogs.deleteMany({ where: { blogId: { in: ids } } }),
        db.blog.deleteMany({ where: { ...cleanupWhere, id: { in: ids } } }),
      ]);
    }
    expect(await db.blog.count({ where: cleanupWhere })).toBe(0);
  }
});
