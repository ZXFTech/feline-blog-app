import { expect, test, type Locator } from "@playwright/test";

test("AC-28/29/31/32 themed time selectors preserve their parent and keyboard focus", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const openTime = async (control: Locator) => {
    if (info.project.use.hasTouch) { await control.focus(); await control.press("ArrowDown"); }
    else await control.click();
  };
  const chooseTime = async (control: Locator, value: string) => {
    await openTime(control);
    if (info.project.use.hasTouch) {
      // Exercise the keyboard contract, including options outside the short viewport.
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.keyboard.press("Home");
      for (let i = 0; i < Number(value); i++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    } else await page.getByRole("option", { name: value, exact: true }).click();
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/album?component=checklist-workflows");
  const sandbox = page.getByTestId("checklist-item-sandbox");
  await expect(sandbox.getByRole("button", { name: "编辑清单项" })).toHaveCount(0);
  await expect(sandbox.getByRole("img", { name: "未确认" })).toHaveAttribute("stroke-width", "2");
  await page.getByRole("button", { name: "批量管理", exact: true }).click();
  await expect(sandbox.getByRole("button", { name: "编辑清单项" })).toBeVisible();
  await page.getByRole("button", { name: "退出批量管理", exact: true }).click();
  await expect(sandbox.getByRole("button", { name: "编辑清单项" })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "选择截止日期时间" });
  if (!(await trigger.count()))
    await page.getByRole("checkbox", { name: "指定截止日期时间" }).click();
  for (const theme of ["light", "dark", "sugar", "warm"]) {
    await page.evaluate((value) => {
      document.documentElement.classList.remove("dark", "sugar", "warm");
      if (value !== "light") document.documentElement.classList.add(value);
    }, theme);
    await trigger.click();
    const popup = page.locator('[data-slot="popover-content"]');
    const hour = page.getByRole("combobox", { name: "小时" });
    const minute = page.getByRole("combobox", { name: "分钟" });
    await chooseTime(hour, "23");
    await expect(popup).toBeVisible();
    await chooseTime(minute, "59");
    await expect(popup).toBeVisible();
    await expect(hour).toHaveText("23");
    await expect(minute).toHaveText("59");
    await openTime(minute);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(popup).toBeVisible();
    await expect(minute).toBeFocused();
    await openTime(hour);
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: `test-results/checklist-time-${theme}-${info.project.name}.png`,
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }

  await page.getByRole("button", { name: "重置表单", exact: true }).click();
  await page.getByRole("checkbox", { name: "指定截止日期时间" }).click();
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 400 });
  await trigger.click();
  const minute = page.getByRole("combobox", { name: "分钟" });
  const hour = page.getByRole("combobox", { name: "小时" });
  await chooseTime(minute, "34");
  await expect(hour).toHaveText("09");
  await expect(minute).toHaveText("34");
  await chooseTime(hour, "00");
  await expect(minute).toHaveText("34");
  await chooseTime(minute, "00");
  await expect(hour).toHaveText("00");
  await expect(minute).toHaveText("00");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
