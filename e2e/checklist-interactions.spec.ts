import { expect, test } from "@playwright/test";

test("AC-28/29/31/32 themed time selectors preserve their parent and keyboard focus", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
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
    await hour.click();
    await page.getByRole("option", { name: "23", exact: true }).click();
    await expect(popup).toBeVisible();
    await minute.click();
    await page.getByRole("option", { name: "59", exact: true }).click();
    await expect(popup).toBeVisible();
    await expect(hour).toHaveText("23");
    await expect(minute).toHaveText("59");
    await minute.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(popup).toBeVisible();
    await expect(minute).toBeFocused();
    await hour.click();
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
  await minute.click();
  await page.getByRole("option", { name: "34", exact: true }).click();
  await expect(hour).toHaveText("09");
  await expect(minute).toHaveText("34");
  await hour.click();
  await page.getByRole("option", { name: "00", exact: true }).click();
  await expect(minute).toHaveText("34");
  await minute.click();
  await page.getByRole("option", { name: "00", exact: true }).click();
  await expect(hour).toHaveText("00");
  await expect(minute).toHaveText("00");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
