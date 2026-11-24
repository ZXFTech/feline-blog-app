import { expect, test } from "@playwright/test";

test.use({ trace: "off", actionTimeout: 10_000 });
test("安全 Album 编辑器覆盖四主题、窄屏、断点和全屏焦点", async ({ page }, info) => {
  // spec 0016 covers: AC-3, AC-12, AC-14.
  // WebKit performs real viewport, focus and long Markdown layout work in this matrix.
  // Keep each action's ten-second limit separate from the complete matrix budget.
  test.setTimeout(300_000);
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      businessRequests.push(request.url());
  });
  await page.goto("/album?component=blog-editor");
  const frame = page.locator(".blog-editor-frame").first();
  await expect(frame).toBeVisible();
  const input = frame.getByLabel("Markdown 正文", { exact: true });
  const original = `${await input.inputValue()}\n\n${Array.from({ length: 80 }, (_, i) => `## 章节 ${i}\n\n足够长的本地内容，用来保留独立滚动位置。`).join("\n\n")}`;
  await input.fill(original);
  await expect(frame.getByRole("status")).toHaveText("草稿已保存");
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
      await page.getByRole("radio", { name: theme, exact: true }).first().click();
      await expect(frame.getByRole("button", { name: "提交", exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await frame.getByRole("button", { name: "预览", exact: true }).click();
      await expect(frame.locator(".preview-part")).toBeVisible();
      const actualWidth = await frame.evaluate(
        (element) =>
          element.clientWidth -
          parseFloat(getComputedStyle(element).paddingLeft) -
          parseFloat(getComputedStyle(element).paddingRight)
      );
      if (actualWidth < 768) {
        await expect(input).toBeHidden();
        await frame.getByRole("button", { name: "编辑", exact: true }).click();
      } else {
        await expect(input).toBeVisible();
        await frame.getByRole("button", { name: "关闭预览", exact: true }).click();
      }
      await frame.getByRole("button", { name: "全屏", exact: true }).click();
      await expect(frame).toHaveAttribute("role", "dialog");
      // A pointer target at the submit button must belong to the editor, above the navbar.
      const hit = await frame
        .getByRole("button", { name: "提交", exact: true })
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const top = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          const ancestors = [];
          for (let node: Element | null = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            ancestors.push({
              class: node.className,
              z: style.zIndex,
              contain: style.contain,
              container: style.containerType,
              transform: style.transform,
            });
          }
          return {
            inside: element.contains(top),
            top: top?.outerHTML.slice(0, 300),
            rect: rect.toJSON(),
            ancestors,
          };
        });
      expect(hit.inside, JSON.stringify({ width, theme, ...hit })).toBe(true);
      if (width === 320 && theme === "Light") {
        await frame.getByRole("button", { name: "编辑标签", exact: true }).click();
        await frame.getByLabel("标签名称", { exact: true }).fill("键盘标签");
        await frame.getByRole("button", { name: "选择标签颜色", exact: true }).click();
        const swatch = page.getByRole("button", { name: /^选择 .+ 颜色$/ }).first();
        await swatch.focus();
        await expect(swatch).toBeFocused();
        await page.keyboard.press("Enter");
        await frame.getByRole("button", { name: "确认标签", exact: true }).click();
        await expect(
          frame.getByRole("button", { name: "移除键盘标签", exact: true })
        ).toBeVisible();
        await frame.getByRole("button", { name: "收起标签编辑", exact: true }).click();
      }
      if ((width === 320 && theme === "Light") || (width === 1280 && theme === "Dark"))
        await page.screenshot({ path: info.outputPath(`editor-${width}-${theme}.png`) });
      await page.keyboard.press("Escape");
      await expect(frame.getByRole("button", { name: "全屏", exact: true })).toBeFocused();
      await expect(input).toHaveValue(original);
    }
  }
  // Exact container boundary, including fractional widths.
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const width of [767.5, 768]) {
    await frame.evaluate((element, value) => {
      element.style.boxSizing = "content-box";
      element.style.width = `${value}px`;
    }, width);
    await frame.getByRole("button", { name: "预览", exact: true }).click();
    if (width < 768) await expect(input).toBeHidden();
    else await expect(input).toBeVisible();
    await frame.getByRole("button", { name: /关闭预览|^编辑$/ }).click();
  }
  await input.evaluate((element) => {
    element.scrollTop = 250;
  });
  await frame.getByRole("button", { name: "预览", exact: true }).click();
  const preview = frame.locator(".preview-part");
  await preview.evaluate((element) => {
    element.scrollTop = 175;
  });
  const before = await input.evaluate((element) => element.scrollTop);
  const previewBefore = await preview.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  expect(previewBefore).toBeGreaterThan(0);
  await frame.getByRole("button", { name: "关闭预览", exact: true }).click();
  await frame.getByRole("button", { name: "预览", exact: true }).click();
  expect(await input.evaluate((element) => element.scrollTop)).toBe(before);
  expect(await preview.evaluate((element) => element.scrollTop)).toBe(previewBefore);
  expect(businessRequests).toEqual([]);
});

declare global {
  interface Window {
    dialogMotionEvents: string[];
  }
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`Blog 确认框遵循动态效果偏好：${reducedMotion}`, async ({ page }, info) => {
    // spec 0016 covers: AC-9, AC-10, AC-11, AC-12, AC-14. Check actual portal animations.
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion });
    await page.goto("/album?component=blog-editor");
    await page.evaluate(() => {
      window.dialogMotionEvents = [];
      document.addEventListener("animationstart", (event) => {
        if (!(event.target instanceof Element)) return;
        const slot = event.target.getAttribute("data-slot");
        if (slot === "alert-dialog-overlay" || slot === "alert-dialog-content")
          window.dialogMotionEvents.push(`${slot}:${event.animationName}`);
      });
    });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      reducedMotion === "reduce"
    );
    const scenario = page.getByRole("combobox", { name: "演示场景", exact: true }).first();
    const dialog = page.getByRole("alertdialog");
    const overlay = page.locator('[data-slot="alert-dialog-overlay"]');
    const observations: object[] = [];

    const checkOpenDialog = async (label: string) => {
      await expect(dialog).toBeVisible();
      // Read actual portal styles; Album's descendant-only motion rule cannot cover them.
      const styles = await dialog.evaluate((element) => ({
        insideShowcase: element.closest(".album-showcase") !== null,
        animation: getComputedStyle(element).animationName,
      }));
      observations.push({ label, reducedMotion, ...styles });
      expect(styles.insideShowcase).toBe(false);
      await expect(dialog).toHaveCSS(
        "animation-name",
        reducedMotion === "reduce" ? "none" : "enter"
      );
      await expect(overlay).toHaveCSS(
        "animation-name",
        reducedMotion === "reduce" ? "none" : "enter"
      );
      if (reducedMotion === "no-preference")
        await expect
          .poll(() => page.evaluate(() => [...window.dialogMotionEvents].sort()))
          .toEqual(["alert-dialog-content:enter", "alert-dialog-overlay:enter"]);
      await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
    };
    const dismissAndCheckMotion = async () => {
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(overlay).toHaveCount(0);
      // Capture both entry and exit, so an unguarded close animation also fails.
      const expected =
        reducedMotion === "reduce"
          ? []
          : [
              "alert-dialog-content:enter",
              "alert-dialog-content:exit",
              "alert-dialog-overlay:enter",
              "alert-dialog-overlay:exit",
            ];
      await expect
        .poll(() => page.evaluate(() => [...window.dialogMotionEvents].sort()))
        .toEqual(expected);
      await page.evaluate(() => {
        window.dialogMotionEvents = [];
      });
    };

    await scenario.selectOption("草稿列表");
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 844 : 900 });
      for (const theme of ["Light", "Dark", "Sugar", "Warm"]) {
        await page.getByRole("radio", { name: theme, exact: true }).first().click();
        await page.getByRole("button", { name: "删除草稿", exact: true }).first().click();
        await checkOpenDialog(`删除草稿/${width}/${theme}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        if (width === 320 && theme === "Dark")
          await page.screenshot({ path: info.outputPath(`delete-${reducedMotion}.png`) });
        await dismissAndCheckMotion();
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await scenario.selectOption("版本冲突");
    const frame = page.locator(".blog-editor-frame").first();
    const input = frame.getByLabel("Markdown 正文", { exact: true });
    const content = "保留本页内容，检查全屏内的冲突确认框。";
    await input.fill(content);
    await expect(frame.getByRole("button", { name: "载入最新草稿", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "全屏", exact: true }).click();
    await frame.getByRole("button", { name: "载入最新草稿", exact: true }).click();
    await checkOpenDialog("载入最新草稿/390/全屏");
    await page.screenshot({ path: info.outputPath(`conflict-${reducedMotion}.png`) });
    await dismissAndCheckMotion();
    await expect(frame).toHaveAttribute("role", "dialog");
    await expect(input).toHaveValue(content);
    await page.keyboard.press("Escape");
    await expect(frame.getByRole("button", { name: "全屏", exact: true })).toBeFocused();
    await frame.getByRole("link", { name: "退出编辑", exact: true }).click();
    await frame.getByRole("button", { name: "放弃未保存修改并退出", exact: true }).click();
    await checkOpenDialog("放弃未保存修改/390/普通");
    await page.screenshot({ path: info.outputPath(`exit-${reducedMotion}.png`) });
    await dismissAndCheckMotion();
    await expect(input).toHaveValue(content);
    await info.attach("dialog-motion", {
      body: JSON.stringify(observations, null, 2),
      contentType: "application/json",
    });
  });
}
