import { expect, test } from "@playwright/test";

import { login } from "./pomodoro-helpers";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

test("clearable InputField clears its value and restores focus", async ({ page }) => {
  await page.goto("/album?component=input-field");

  const clearButton = page.getByRole("button", { name: "清空输入" }).first();
  await clearButton.evaluate((element) => {
    element.closest('[data-slot="input-group"]')?.setAttribute("data-clear-test-target", "true");
  });
  const group = page.locator('[data-clear-test-target="true"]');
  const input = group.locator("input");
  await expect(input).toHaveValue("可清空的搜索词");
  await clearButton.click();

  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
});

test("formatter does not log an error for its initial empty state", async ({ page }) => {
  const errors: { text: string; url: string }[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push({ text: message.text(), url: message.location().url });
  });
  const anonymousRead = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/me");
  await page.goto("/formatter");
  const response = await anonymousRead;
  expect(response.status()).toBe(401);
  await expect(page.getByText("列表", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await expect(page.locator("textarea")).toHaveValue("");
  expect(pageErrors).toEqual([]);
  // Chromium reports the separately asserted anonymous 401 as a resource error.
  const unexpectedErrors = errors.filter(error => !(
    error.url === response.url() &&
    error.text === "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
  ));
  expect(unexpectedErrors).toEqual([]);
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
