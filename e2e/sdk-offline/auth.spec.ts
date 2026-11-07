import { test, expect } from "@playwright/test";
test("configuration failure keeps business closed and legacy auth disabled", async ({
  page,
  request,
}) => {
  const response = await page.goto("/todo");
  expect(response?.status()).toBe(503);
  await expect(page.getByRole("heading", { name: "业务维护中" })).toBeVisible();
  expect((await request.get("/api/checklists")).status()).toBe(503);
  expect(
    (
      await request.post("/api/auth/login", {
        data: { email: "legacy@example.test", password: "synthetic" },
      })
    ).status()
  ).toBe(404);
  expect((await request.get("/api/health")).status()).toBe(200);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录暂时不可用" })).toBeVisible();
  await expect(page.getByLabel("密码", { exact: true })).toHaveCount(0);
});
test("Album profile and logout fixtures perform no auth or data requests", async ({ page }) => {
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      authRequests.push(new URL(request.url()).pathname);
  });
  await page.goto("/album?component=sdk-auth");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "完成博客资料" }) });
  await expect(form).toBeVisible();
  await form.getByLabel("博客昵称", { exact: true }).fill("本地读者");
  await form
    .getByRole("checkbox", { name: "我确认将此邮箱保存为博客联系邮箱", exact: true })
    .check();
  await form.getByRole("button", { name: "完成博客资料" }).click();
  await expect(form.getByRole("status")).toContainText("本地演示");
  await page.getByRole("button", { name: "退出未确认演示", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "退出尚未确认" })).toBeVisible();
  expect(authRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `.feline-blog/auth-rebuild/sdk-album-${test.info().project.name}.png`,
    fullPage: true,
  });
});
