import { expect, test } from "@playwright/test";

test("defaults to light and restores an explicit theme across page lifecycles", async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("html")).not.toHaveClass(/dark|sugar|warm/);
  await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("radio", { name: "Sugar" }).click();
  await expect(page.locator("html")).toHaveClass(/sugar/);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveClass(/sugar/);
  await expect(page.getByRole("radio", { name: "Sugar" })).toHaveAttribute("aria-checked", "true");

  await page.close();
  const reopenedPage = await context.newPage();
  await reopenedPage.goto("/");
  await reopenedPage.waitForLoadState("networkidle");
  await expect(reopenedPage.locator("html")).toHaveClass(/sugar/);
  await expect(reopenedPage.getByRole("radio", { name: "Sugar" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
});

test("AC-4 switches every supported theme and disables visual transitions for reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  for (const theme of ["Dark", "Sugar", "Warm", "Light"] as const) {
    await page.getByRole("radio", { name: theme }).click();
    await expect(page.getByRole("radio", { name: theme })).toHaveAttribute("aria-checked", "true");
  }

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/theme-transitioning/);
  const duration = await page
    .locator("body")
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration).toBe("0s");
});
