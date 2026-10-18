import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.skip(!email || !password, "需要 E2E_USER_EMAIL 和 E2E_USER_PASSWORD");

test("covers: AC-7, keeps the signed in user after a hard reload of the tomato page", async ({
  page,
}) => {
  await page.goto("/login?from=/tomato");
  await page.getByText("旧账号登录", { exact: true }).click();
  await page.getByLabel("原博客邮箱").fill(email!);
  await page.getByLabel("原博客密码").fill(password!);
  await page.getByRole("button", { name: "登录旧账号" }).click();
  await page.waitForURL(/\/profile$/);
  await page.goto("/tomato");

  await expect(page).toHaveURL(/\/tomato$/);
  await expect(page.getByRole("heading", { name: "番茄钟" })).toBeVisible();
  await expect(page.getByRole("alert", { name: "请先登录" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "番茄钟日期" })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/tomato$/);
  await expect(page.getByRole("heading", { name: "番茄钟" })).toBeVisible();
  await expect(page.getByRole("alert", { name: "请先登录" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "番茄钟日期" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始专注" })).toBeEnabled();
});
