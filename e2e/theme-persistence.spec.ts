import { expect, test } from "@playwright/test";

test("follows the system until a user theme persists across page lifecycles", async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "使用深色主题" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "使用糖果主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sugar");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sugar");
  await expect(page.getByRole("button", { name: "使用糖果主题" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.close();
  const reopenedPage = await context.newPage();
  await reopenedPage.goto("/");
  await expect(reopenedPage.locator("html")).toHaveAttribute("data-theme", "sugar");
  await expect(reopenedPage.getByRole("button", { name: "使用糖果主题" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
