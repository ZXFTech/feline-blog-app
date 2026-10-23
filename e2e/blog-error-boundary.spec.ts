import { expect, test, type Route } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import db from "@/db/postgres/runtime";

test.setTimeout(90_000);
// Login credentials and the issued Cookie must stay out of retained traces.
test.use({ trace: "off" });

const database = process.env.POSTGRES_DATABASE_URL
  ? new URL(process.env.POSTGRES_DATABASE_URL)
  : null;
const safeLocal =
  database &&
  ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) &&
  database.pathname === "/feline_blog_dev" &&
  process.env.POSTGRES_ENVIRONMENT === "local";
test.skip(
  !safeLocal || !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
  "需要安全本地 PostgreSQL 与测试账号"
);

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Test only network substitution. This is a render error delivered to the real
// Next boundary, not an ActionResult or evidence of a database failure.
// Keep the installed Next 16 Flight envelope intact and replace only the selected
// page component reference. Fail loudly if the protocol or module changes.
function injectRenderError(body: string, component: string) {
  let replacements = 0;
  function replaceReference(payload: string) {
    return payload.replace(
      /^([\da-f]+):I(\[.*\])$/gm,
      (line: string, id: string, reference: string) => {
        if (!reference.includes(component)) return line;
        replacements++;
        return `${id}:E${JSON.stringify({
          digest: "blog-error-boundary-test",
          name: "Error",
          message: "private controlled render failure",
          stack: [],
          env: "Server",
        })}`;
      }
    );
  }
  const patched = replaceReference(body);
  expect(replacements, `Expected one Flight reference for ${component}`).toBe(1);
  return patched;
}

let articleId: number;
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
  marker = `blog-boundary-${info.project.name}-${Date.now()}`;
  const article = await db.blog.create({
    data: { authorId, title: marker, content: "错误边界恢复后的真实文章正文。" },
    select: { id: true },
  });
  articleId = article.id;
});

test.afterAll(async () => {
  try {
    if (articleId)
      await db.blog.deleteMany({
        where: { id: articleId, authorId, title: { startsWith: marker } },
      });
  } finally {
    await db.$disconnect();
  }
});

const surfaces = [
  { name: "列表", component: "BlogListOperationBar.tsx", kind: "list" },
  { name: "详情", component: "BlogReading.tsx", kind: "detail" },
  { name: "新建", component: "BlogEditor.tsx", kind: "new" },
  { name: "编辑", component: "BlogEditor.tsx", kind: "edit" },
] as const;

for (const surface of surfaces) {
  test(`${surface.name}错误边界点击返回文章列表能恢复`, async ({ page }, info) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD },
    });
    expect(login.status()).toBe(200);
    const pathname =
      surface.kind === "list"
        ? "/blog"
        : surface.kind === "detail"
          ? `/blog/${articleId}`
          : surface.kind === "new"
            ? "/blog/new"
            : `/blog/edit/${articleId}`;
    let injected = false;
    await page.route("**/blog**", async (route) => {
      const request = route.request();
      if (
        !injected &&
        new URL(request.url()).pathname === pathname &&
        request.method() === "GET" &&
        request.headers().rsc === "1" &&
        !request.headers()["next-router-prefetch"]
      ) {
        const response = await route.fetch();
        const body = injectRenderError(await response.text(), surface.component);
        injected = true;
        await route.fulfill({ response, body });
      } else await route.continue();
    });
    await page.goto(
      surface.kind === "list"
        ? "/album?component=blog-status"
        : surface.kind === "edit"
          ? `/blog/${articleId}`
          : "/blog"
    );
    await page.waitForLoadState("networkidle");
    if (surface.kind === "list")
      await page.getByRole("link", { name: "BLOG", exact: true }).click();
    else if (surface.kind === "detail")
      await page.getByRole("link", { name: new RegExp(marker) }).click();
    else if (surface.kind === "new")
      await page.getByRole("button", { name: "新建", exact: true }).click();
    else await page.getByRole("link", { name: "编辑", exact: true }).click();

    const failure = page.getByRole("heading", { name: "Blog 页面暂时无法加载", exact: true });
    await expect(failure).toBeVisible();
    expect(injected).toBe(true);
    await page.evaluate(
      (url) => history.replaceState(null, "", url),
      `${pathname}?extra=keep#list`
    );
    const back = page.getByRole("link", { name: "返回文章列表", exact: true });
    await expect(back).toHaveAttribute("href", "/blog");
    await back.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL("/blog");
    await expect(page.getByRole("heading", { name: "文章", exact: true })).toBeVisible();
    await expect(failure).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(marker) })).toBeVisible();
    await page.screenshot({ path: info.outputPath("boundary-return-list.png") });
  });
}

for (const surface of surfaces) {
  // covers: spec 0014 AC-7, AC-8, AC-9, AC-10, AC-11, AC-12.
  test(`${surface.name}的真实路由错误边界保留地址，重复失败后手动重新读取`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 800 }
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const login = await page.request.post("/api/auth/login", {
      data: {
        email: process.env.E2E_USER_EMAIL,
        password: process.env.E2E_USER_PASSWORD,
      },
    });
    expect(login.status()).toBe(200);

    const pathname =
      surface.kind === "list"
        ? "/blog"
        : surface.kind === "detail"
          ? `/blog/${articleId}`
          : surface.kind === "new"
            ? "/blog/new"
            : `/blog/edit/${articleId}`;
    const target = `${pathname}?orderBy=asc&extra=keep#boundary`;
    let failing = true;
    let reads = 0;
    let hold: ReturnType<typeof signal> | undefined;
    let started: ReturnType<typeof signal> | undefined;
    const diagnostics: string[] = [];
    page.on("pageerror", (error) => diagnostics.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(message.text());
    });
    const intercept = async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        request.method() !== "GET" ||
        url.pathname !== pathname ||
        request.headers()["next-router-prefetch"] ||
        request.headers().rsc !== "1"
      ) {
        await route.continue();
        return;
      }
      reads++;
      const shouldFail = failing;
      const wait = hold;
      started?.resolve();
      const response = await route.fetch();
      const body = await response.text();
      const type = response.headers()["content-type"] ?? "";
      expect(type).toContain("text/x-component");
      const output = shouldFail ? injectRenderError(body, surface.component) : body;
      diagnostics.push(
        `read=${reads},type=${type},failure=${shouldFail},injected=${output.includes("blog-error-boundary-test")}`
      );
      if (wait) await wait.promise;
      await route.fulfill({ response, body: output });
    };
    await page.route("**/blog**", intercept);
    try {
      const entry =
        surface.kind === "list"
          ? "/album?component=blog-status"
          : surface.kind === "edit"
            ? `/blog/${articleId}`
            : "/blog";
      await page.goto(entry);
      await page.waitForLoadState("networkidle");
      if (surface.kind === "list")
        await page.getByRole("link", { name: "BLOG", exact: true }).click();
      else if (surface.kind === "detail")
        await page.getByRole("link", { name: new RegExp(marker) }).click();
      else if (surface.kind === "new")
        await page.getByRole("button", { name: "新建", exact: true }).click();
      else await page.getByRole("link", { name: "编辑", exact: true }).click();
      const failure = page.getByRole("heading", { name: "Blog 页面暂时无法加载", exact: true });
      await expect(failure).toBeVisible();
      // Native history changes the current query and fragment without retrying.
      // Recovery must read this URL, not the address of the earlier failure.
      await page.evaluate((url) => history.replaceState(null, "", url), target);
      await expect(failure).toBeVisible();
      const address = page.url();
      expect(address).toBe(new URL(target, "http://localhost:3000").href);
      await expect(failure.locator("..")).not.toContainText("private controlled render failure");
      await expect(page.getByRole("link", { name: "返回文章列表", exact: true })).toHaveAttribute(
        "href",
        "/blog"
      );
      await page.waitForLoadState("networkidle");
      expect(reads).toBe(1);

      for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
        await page.getByRole("radio", { name: theme, exact: true }).click();
        await expect(failure).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({ path: info.outputPath(`boundary-${theme}.png`) });
      }

      hold = signal();
      started = signal();
      await page.getByRole("button", { name: "重试", exact: true }).focus();
      await page.keyboard.press("Enter");
      await started.promise;
      const pending = page.getByRole("button", { name: "正在重新读取…", exact: true });
      await expect(pending).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("正在重新读取当前页面", { exact: true })).toBeVisible();
      await page.keyboard.press("Enter");
      hold.resolve();
      await expect(page.getByRole("button", { name: "重试", exact: true })).toBeEnabled();
      await expect(failure).toBeVisible();
      expect(reads).toBe(2);
      expect(page.url()).toBe(address);

      failing = false;
      hold = signal();
      started = signal();
      const recoveredTitle = `${marker}-${surface.kind}`;
      await db.blog.update({ where: { id: articleId, authorId }, data: { title: recoveredTitle } });
      await page.getByRole("button", { name: "重试", exact: true }).focus();
      await page.keyboard.press("Enter");
      await started.promise;
      await expect(pending).toHaveAttribute("aria-disabled", "true");
      if (surface.kind === "detail") {
        const otherControl = page.getByRole("radio", { name: "Light", exact: true });
        await otherControl.focus();
        await page.keyboard.press("Space");
        await expect(otherControl).toBeFocused();
      }
      hold.resolve();

      await expect(failure).toHaveCount(0);
      expect(reads).toBe(3);
      expect(page.url()).toBe(address);
      if (surface.kind === "list") {
        await expect(page.getByRole("heading", { name: "文章", exact: true })).toBeFocused();
        await expect(page.getByRole("link", { name: new RegExp(recoveredTitle) })).toBeVisible();
      } else if (surface.kind === "detail") {
        await expect(
          page.getByRole("heading", { name: recoveredTitle, exact: true })
        ).toBeVisible();
        await expect(page.locator("#blog-content")).toContainText("错误边界恢复后的真实文章正文");
        await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeFocused();
      } else {
        await expect(page.getByPlaceholder("无标题")).toHaveValue(
          surface.kind === "new" ? "" : recoveredTitle
        );
        await page.getByRole("button", { name: /预览/ }).click();
        await expect(page.getByRole("button", { name: /关闭预览/ })).toBeVisible();
      }
      await page.screenshot({ path: info.outputPath("boundary-recovered.png") });
    } finally {
      hold?.resolve();
      await page.unroute("**/blog**", intercept);
      await writeFile(info.outputPath("boundary-diagnostics.json"), JSON.stringify(diagnostics));
    }
  });
}
