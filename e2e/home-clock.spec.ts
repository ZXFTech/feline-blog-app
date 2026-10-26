import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark", "sugar", "warm"] as const)
  test(`homepage clock hydrates delayed HTML and keeps ticking in ${theme} theme`, async ({
    page,
  }, info) => {
    const hydrationErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat|server rendered|didn't match/i.test(message.text()))
        hydrationErrors.push(message.text());
    });
    await page.addInitScript((value) => localStorage.setItem("donmiss-theme", value), theme);
    // Delay actual hydration while allowing server time to cross at least one second.
    await page.route("**/_next/**/*.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    const html = await page.request.get("/");
    expect(html.status()).toBe(200);
    expect((await html.text()).includes("正在加载时钟")).toBe(true);
    await page.goto("/");
    const clock = page.locator(".flip-clock").last();
    await expect(clock).toBeVisible();
    if (theme === "light") await expect(page.locator("html")).not.toHaveClass(/dark|sugar|warm/);
    else await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await expect(page.getByRole("status").filter({ hasText: "正在加载时钟" })).toHaveCount(0);
    const first = await clock.textContent();
    await expect.poll(() => clock.textContent(), { timeout: 5000 }).not.toBe(first);
    expect(hydrationErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    await page.screenshot({
      path: `.feline-blog/${info.project.name}-homepage-clock-${theme}.png`,
    });
  });
