import { expect, test } from "@playwright/test";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

test.skip(!account.email || !account.password, "需要本地测试账号");

test("checklist date picker disables past days and matches the operation menu surface", async ({
  page,
}) => {
  const styles = async (selector: string, properties: string[]) =>
    page
      .locator(selector)
      .first()
      .evaluate((element, names) => {
        const computed = getComputedStyle(element);
        return Object.fromEntries(names.map((name) => [name, computed.getPropertyValue(name)]));
      }, properties);
  const popupProperties = [
    "width",
    "background-color",
    "color",
    "box-shadow",
    "border-radius",
    "padding",
    "font-size",
    "line-height",
  ];
  const itemProperties = [
    "font-size",
    "font-weight",
    "line-height",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "border-radius",
  ];
  const dayProperties = ["font-size", "font-weight", "line-height", "border-radius"];
  const signedIn = await page.request.post("/api/auth/login", { data: account });
  expect(signedIn.ok()).toBe(true);
  await page.goto("/checklists/new");
  await page.getByRole("button", { name: "选择截止日期时间" }).click();

  const popup = page.locator('[data-slot="popover-content"]');
  await expect(popup).toBeVisible();
  await expect(page.locator('[data-slot="calendar"]')).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
  const dates = await page.evaluate(() => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { today: now.toLocaleDateString(), yesterday: yesterday.toLocaleDateString() };
  });
  await expect(
    page.locator(`[data-slot="calendar"] [data-day="${dates.yesterday}"]`)
  ).toBeDisabled();
  await expect(page.locator(`[data-slot="calendar"] [data-day="${dates.today}"]`)).toBeEnabled();

  const calendarSurface = await styles('[data-slot="popover-content"]', popupProperties);
  await expect(page.locator('[data-slot="calendar"]')).toHaveCSS("padding", "0px");
  const dateLabel = await styles(".rdp-caption_label", [
    "font-size",
    "font-weight",
    "line-height",
    "color",
  ]);
  const timeLabel = await styles('[data-slot="popover-content"] > div > div:last-child > span', [
    "font-size",
    "font-weight",
    "line-height",
    "color",
  ]);
  const dayStyle = await styles('[data-slot="calendar"] button[data-day]', dayProperties);
  const todayBackground = await styles('[data-slot="calendar"] .rdp-today', ["background-color"]);
  expect(todayBackground["background-color"]).not.toBe("rgba(0, 0, 0, 0)");
  const hourTrigger = page.getByRole("combobox", { name: "小时" });
  await expect(hourTrigger).toHaveCSS("height", "32px");
  await expect(hourTrigger).toHaveCSS("box-shadow", /^(none|rgba\(0, 0, 0, 0\))/);
  await hourTrigger.click();
  const timeSurface = await styles('[data-slot="select-content"]', popupProperties);
  const timeItem = await styles('[data-slot="select-item"]', [...itemProperties, "padding-right"]);
  const comfortableInset = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--spacing-panel-inset-comfortable")
      .trim()
  );
  const comfortablePixels = `${Number.parseFloat(comfortableInset) * 16}px`;
  expect(timeItem["padding-left"]).toBe(comfortablePixels);
  expect(timeItem["padding-right"]).toBe(comfortablePixels);
  expect(Number.parseFloat(timeSurface.width)).toBeLessThan(
    Number.parseFloat(calendarSurface.width)
  );
  expect(Number.parseFloat(timeSurface.width)).toBeLessThanOrEqual(96);
  await expect(popup).toHaveCSS("overflow-x", "visible");
  const optionVisible = await page
    .locator('[data-slot="select-item"]')
    .first()
    .evaluate((item) => {
      const box = item.getBoundingClientRect();
      const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return center === item || item.contains(center);
    });
  expect(optionVisible).toBe(true);
  await page.goto("/album?component=calendar");
  const albumTodayBackground = await styles('[data-slot="calendar"] .rdp-today', [
    "background-color",
  ]);
  expect(todayBackground).toEqual(albumTodayBackground);
  await page.goto("/album?component=menus");
  await page.getByRole("button", { name: "打开操作菜单" }).click();
  const menuSurface = await styles('[data-slot="dropdown-menu-content"]', popupProperties);
  const menuLabel = await styles('[data-slot="dropdown-menu-label"]', [
    "font-size",
    "font-weight",
    "line-height",
    "color",
  ]);
  const menuItem = await styles('[data-slot="dropdown-menu-item"]', itemProperties);
  expect(calendarSurface).toEqual(menuSurface);
  expect({ ...timeSurface, width: menuSurface.width }).toEqual(menuSurface);
  expect(dateLabel).toEqual(menuLabel);
  expect(timeLabel).toEqual(menuLabel);
  expect(dayStyle).toEqual(await styles('[data-slot="dropdown-menu-item"]', dayProperties));
  for (const property of itemProperties.filter((name) => name !== "padding-left")) {
    expect(timeItem[property]).toBe(menuItem[property]);
  }
});

test("date and time popups follow the operation menu in every theme", async ({ page }) => {
  test.setTimeout(90_000);
  const signedIn = await page.request.post("/api/auth/login", { data: account });
  expect(signedIn.ok()).toBe(true);

  const surface = async (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          color: style.color,
          shadow: style.boxShadow,
          radius: style.borderRadius,
          padding: style.padding,
        };
      });

  for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
    await page.goto("/checklists/new");
    const themeButton = page.getByRole("radio", { name: theme });
    await themeButton.click();
    await expect(themeButton).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "选择截止日期时间" }).click();
    const dateSurface = await surface('[data-slot="popover-content"]');
    await page.getByRole("combobox", { name: "小时" }).click();
    const timeSurface = await surface('[data-slot="select-content"]');
    await page.goto("/album?component=menus");
    await page.getByRole("button", { name: "打开操作菜单" }).click();
    const menuSurface = await surface('[data-slot="dropdown-menu-content"]');
    expect(dateSurface, theme).toEqual(menuSurface);
    expect(timeSurface, theme).toEqual(menuSurface);
  }
});
