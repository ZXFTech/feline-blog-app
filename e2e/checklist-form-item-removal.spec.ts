import { expect, test } from "@playwright/test";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

test.skip(!account.email || !account.password, "需要本地测试账号");

test("the sole draft item can be removed before create validates the item count", async ({
  page,
}) => {
  const signedIn = await page.request.post("/api/auth/login", { data: account });
  expect(signedIn.ok()).toBe(true);
  await page.goto("/checklists/new");

  await page.getByRole("button", { name: "选择截止日期时间" }).click();
  const tomorrow = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toLocaleDateString();
  });
  await page.locator(`[data-slot="calendar"] button[data-day="${tomorrow}"]`).click();
  await page.keyboard.press("Escape");

  await page.getByRole("textbox", { name: "清单项详情" }).fill("唯一草稿项目");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("已添加清单项（1）")).toBeVisible();

  await page.getByRole("button", { name: "删除清单项" }).click();
  await expect(page.getByRole("button", { name: "确认删除" })).toBeEnabled();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("已添加清单项（0）")).toBeVisible();
  await expect(page.getByText("清单至少需要一个已添加项目")).toHaveCount(0);

  await page.getByRole("textbox", { name: "清单名" }).fill("草稿删除验收");
  await expect(page.getByRole("textbox", { name: "清单名" })).toHaveValue("草稿删除验收");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("清单至少需要一个已添加项目", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/checklists\/new$/);
});
