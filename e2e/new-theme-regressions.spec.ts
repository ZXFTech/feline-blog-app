import { expect, test } from "@playwright/test";

import { login } from "./pomodoro-helpers";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

test("clearable InputField clears its value and restores focus", async ({ page }) => {
  await page.goto("/album");

  const clearButton = page.getByRole("button", { name: "清空输入" }).first();
  await clearButton.evaluate((element) => {
    element.closest('[data-slot="input-group"]')?.setAttribute("data-clear-test-target", "true");
  });
  const group = page.locator('[data-clear-test-target="true"]');
  const input = group.locator("input");
  await expect(input).toHaveValue("这是一段默认文字");
  await clearButton.click();

  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
});

test("formatter does not log an error for its initial empty state", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/formatter");
  await expect(page.getByText("列表", { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});

test("tomato page fits a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "只验证移动端布局");
  test.skip(!account.email || !account.password, "需要 E2E_USER_EMAIL 和 E2E_USER_PASSWORD");

  await login(page, account);

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    )
    .toBe(true);
});
