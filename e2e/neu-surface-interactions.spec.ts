import { expect, test } from "@playwright/test";

test("covers: AC-3 and AC-4, selects WeeklyView dates with native keyboard behavior", async ({
  page,
}) => {
  await page.goto("/daily");

  const dateButtons = page.locator("button[aria-pressed]");
  await expect(dateButtons).toHaveCount(7);

  await dateButtons.nth(0).focus();
  await dateButtons.nth(0).press("Enter");
  await expect(page).toHaveURL(/\/daily\?date=\d{4}-\d{2}-\d{2}$/);
  await expect(dateButtons.nth(0)).toHaveAttribute("aria-pressed", "true");
  const firstUrl = page.url();

  await dateButtons.nth(1).focus();
  await dateButtons.nth(1).press("Space");
  await expect.poll(() => page.url()).not.toBe(firstUrl);
  await expect(dateButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
});

test("covers: AC-1 and AC-5, keeps raise semantics on links and decorative cards", async ({
  page,
}) => {
  await page.goto("/blog");

  const homeLink = page.getByRole("link", { name: "HOME" });
  await expect(homeLink).toHaveClass(/neu-interaction-raise-normal/);

  const cards = page.locator(".blog-list-item");
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toHaveClass(/neu-interaction-raise-normal/);
  await expect(cards.first()).not.toHaveAttribute("role", "button");
  await expect(cards.first()).not.toHaveAttribute("tabindex", /.+/);
});
