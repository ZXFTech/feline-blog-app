import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

function buttonMetrics(element: HTMLElement) {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return { padding: style.padding, width: box.width, height: box.height };
}

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const rgb = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!rgb || rgb.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
    const linear = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test.describe("Blog 共享正文与代码块", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.setViewportSize(
      testInfo.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 }
    );
  });

  // covers: AC-1, AC-5, AC-6, AC-7, AC-9, AC-10, AC-12, AC-13.
  test("四主题语法对比度、密度、窄屏局部滚动与键盘换行", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("pageerror", (error) => hydrationErrors.push(error.message));
    await page.goto("/album?component=button");
    const reference = page.getByRole("button", { name: "搜索", exact: true });
    await expect(reference).toBeVisible();
    const defaultIconMetrics = await reference.evaluate(buttonMetrics);
    await page.goto("/album?component=blog-markdown");
    const image = page.getByRole("img", { name: "本地小猫样例，保持原图比例" });
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => (node instanceof HTMLImageElement ? node.decode() : undefined));
    await expect(page.getByRole("heading", { level: 2, name: "Blog 正文与代码块" })).toBeVisible();
    for (const theme of ["light", "dark", "sugar", "warm"]) {
      const sample = page.locator(`[data-album-theme="${theme}"]`);
      const pre = sample.locator(".blog-code-pre");
      await expect(pre).toHaveCSS("font-size", "14px");
      await expect(pre).toHaveCSS("line-height", "19.6px");
      await expect(sample.locator(".blog-code-language")).toHaveClass(/\btag\b/);
      await expect(sample.locator(".blog-code")).toHaveClass(/\bshadow-neu-inset-sm\b/);
      await expect(sample.locator(".blog-markdown")).toHaveCSS("font-size", "14.4px");
      await expect(sample.locator(".blog-markdown")).toHaveCSS("line-height", "21.6px");
      await expect(sample.locator(".blog-markdown")).toHaveCSS("row-gap", "4px");
      const codePanel = sample.locator(".blog-code");
      await expect(codePanel).toHaveCSS("row-gap", "4px");
      await expect(codePanel).toHaveCSS("margin-top", "8px");
      await expect(codePanel).toHaveCSS("margin-bottom", "8px");
      await expect(codePanel.locator(".blog-code-toolbar")).toHaveCSS("gap", "4px");
      await expect(codePanel.locator(".blog-code-actions")).toHaveCSS("gap", "8px");
      const background = await pre.evaluate((node) => getComputedStyle(node).backgroundColor);
      const ratios: Record<string, number> = {};
      const foregrounds: Record<string, string> = {};
      for (const group of ["keyword", "string", "comment"]) {
        const foreground = await sample
          .locator(`.token.${group}`)
          .first()
          .evaluate((node) => getComputedStyle(node).color);
        ratios[group] = contrast(foreground, background);
        foregrounds[group] = foreground;
        expect(ratios[group]).toBeGreaterThanOrEqual(4.5);
      }
      const evidencePath = test.info().outputPath(`${theme}-contrast.json`);
      await writeFile(
        evidencePath,
        JSON.stringify(
          { theme, viewport: page.viewportSize(), background, foregrounds, ratios },
          null,
          2
        )
      );
      await test.info().attach(`${theme}-contrast`, {
        path: evidencePath,
        contentType: "application/json",
      });
    }
    const headingSpacing = await page
      .getByRole("heading", { name: "二级标题", exact: true })
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const previous = element.previousElementSibling!;
        const next = element.nextElementSibling!;
        return {
          before: box.top + parseFloat(style.paddingTop) - previous.getBoundingClientRect().bottom,
          after: next.getBoundingClientRect().top - box.bottom + parseFloat(style.paddingBottom),
        };
      });
    expect(headingSpacing.before).toBeCloseTo(12);
    expect(headingSpacing.after).toBeCloseTo(8);
    const longBlock = page
      .locator(".blog-code")
      .filter({ has: page.getByText("首尾空行与超长行", { exact: true }) });
    const pre = longBlock.locator("pre");
    const source = await pre.locator("code").textContent();
    const numbers = await pre.locator(".blog-code-line-number").count();
    expect(await pre.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await pre.focus();
    await pre.press("ArrowRight");
    await expect.poll(() => pre.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    for (const button of [
      longBlock.getByRole("button", { name: "自动换行" }),
      longBlock.getByRole("button", { name: "复制代码" }),
    ]) {
      expect(await button.evaluate(buttonMetrics)).toEqual(defaultIconMetrics);
    }
    const wrap = longBlock.getByRole("button", { name: "自动换行" });
    await expect(wrap).toHaveAttribute("data-slot", "button");
    await expect(wrap).toHaveText("wrap_text");
    await wrap.focus();
    await wrap.press("Space");
    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    await expect(wrap).toHaveCSS("outline-style", "solid");
    expect(await pre.locator(".blog-code-line-number").count()).toBe(numbers);
    expect(await pre.locator("code").textContent()).toBe(source);
    expect(await pre.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(hydrationErrors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("blog-code-wrap.png") });
  });

  // covers: AC-7, AC-8, AC-12.
  test("剪贴板失败可见且能再次尝试，减少动态效果关闭过渡", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Local test clipboard denial");
          },
        },
      });
    });
    await page.goto("/album?component=blog-markdown");
    // Load the preceding lazy image before locating a lower control. Its natural
    // dimensions otherwise move the click target between WebKit input frames.
    const image = page.getByRole("img", { name: "本地小猫样例，保持原图比例" });
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => (node instanceof HTMLImageElement ? node.decode() : undefined));
    const block = page.locator(".blog-code").first();
    const copy = block.getByRole("button", { name: "复制代码" });
    await expect(copy).toHaveAttribute("data-slot", "button");
    await expect(copy).toHaveText("file_copy");
    await copy.click();
    await expect(block.getByRole("status")).toHaveText("复制失败，请手动选择代码");
    await copy.click();
    await expect(copy).toBeEnabled();
    await expect(block.getByRole("status")).toHaveText("复制失败，请手动选择代码");
    await expect(block.getByRole("status")).toBeVisible();
    await expect(copy).toHaveCSS("transition-duration", "0s");
    await expect(block.locator("pre")).toHaveAttribute("tabindex", "0");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => {} },
      });
    });
    await copy.click();
    await expect(copy).toHaveText("check");
    await expect(block.getByRole("status")).toHaveText("已复制");
    await expect(block.getByRole("status")).toHaveClass(/sr-only/);
    await expect(copy).toHaveText("file_copy");
  });

  // covers: AC-4, AC-7, AC-8, AC-12.
  test("键盘全选只选择当前代码块，保留 Tab、复制和页面原生全选", async ({ page }) => {
    await page.goto("/album?component=blog-markdown");
    const image = page.getByRole("img", { name: "本地小猫样例，保持原图比例" });
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => (node instanceof HTMLImageElement ? node.decode() : undefined));
    const block = page.locator(".blog-code").filter({ hasText: "首尾空行与超长行" });
    const pre = block.locator("pre");
    const source = await pre.locator("code").textContent();
    const wrap = block.getByRole("button", { name: "自动换行", exact: true });
    const copy = block.getByRole("button", { name: "复制代码", exact: true });
    await wrap.focus();
    await page.keyboard.press("Tab");
    await expect(copy).toBeFocused();
    await expect(copy).toHaveCSS("outline-style", "solid");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => {} },
      });
    });
    await page.keyboard.press("Enter");
    await expect(block.getByRole("status")).toHaveText("已复制");
    await page.keyboard.press("Tab");
    await expect(pre).toBeFocused();
    await expect(pre).toHaveCSS("outline-style", "solid");
    for (const shortcut of ["Control+a", "Meta+a"]) {
      await pre.press(shortcut);
      const selected = await pre.evaluate((element) => {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        return {
          text: range?.toString(),
          containerIsCode: range?.commonAncestorContainer === element.querySelector("code"),
          anchorWithinCode: element.querySelector("code")?.contains(selection?.anchorNode ?? null),
          focusWithinCode: element.querySelector("code")?.contains(selection?.focusNode ?? null),
        };
      });
      expect(selected).toEqual({
        text: source,
        containerIsCode: true,
        anchorWithinCode: true,
        focusWithinCode: true,
      });
    }
    await page.screenshot({ path: test.info().outputPath("code-keyboard-selection.png") });
    const empty = page.locator(".blog-code").filter({
      has: page.locator("pre > code:empty"),
    });
    await empty.locator("pre").press("Control+a");
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
    await page.getByRole("heading", { level: 2, name: "Blog 正文与代码块", exact: true }).click();
    await expect(empty.locator("pre")).not.toBeFocused();
    await page.keyboard.press("Control+a");
    expect(await page.evaluate(() => window.getSelection()?.toString())).toContain(
      "Blog 正文与代码块"
    );
  });

  // covers: AC-4, AC-5, AC-7, AC-12. Remounting must restore the default state.
  test("换行状态逐块独立，换行后全选保持原文，重置样例恢复默认", async ({ page }) => {
    await page.goto("/album?component=blog-markdown");
    const image = page.getByRole("img", { name: "本地小猫样例，保持原图比例" });
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => (node instanceof HTMLImageElement ? node.decode() : undefined));
    const first = page.locator(".blog-code").filter({ hasText: "首尾空行与超长行" });
    const second = page.locator(".blog-code").filter({ hasText: "第二个独立代码块" });
    const firstWrap = first.getByRole("button", { name: "自动换行", exact: true });
    const secondWrap = second.getByRole("button", { name: "自动换行", exact: true });
    const source = await first.locator("pre > code").textContent();
    const lines = await first.locator(".blog-code-line-number").count();
    await expect(firstWrap).toHaveAttribute("aria-pressed", "false");
    await expect(secondWrap).toHaveAttribute("aria-pressed", "false");

    await firstWrap.click();
    await expect(firstWrap).toHaveAttribute("aria-pressed", "true");
    await expect(secondWrap).toHaveAttribute("aria-pressed", "false");
    await secondWrap.click();
    await secondWrap.click();
    await expect(secondWrap).toHaveAttribute("aria-pressed", "false");
    await expect(firstWrap).toHaveAttribute("aria-pressed", "true");
    await first.locator("pre").press("Control+a");
    expect(
      await first.locator("pre > code").evaluate((code) => {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        return { text: range?.toString(), withinCode: range?.commonAncestorContainer === code };
      })
    ).toEqual({ text: source, withinCode: true });
    expect(await first.locator(".blog-code-line-number").count()).toBe(lines);

    await page.getByRole("button", { name: /重置样例/ }).click();
    await expect(firstWrap).toHaveAttribute("aria-pressed", "false");
    await expect(secondWrap).toHaveAttribute("aria-pressed", "false");
    await expect(first.locator("pre")).toHaveAttribute("data-wrap", "false");
    expect(await first.locator("pre > code").textContent()).toBe(source);
    expect(await first.locator(".blog-code-line-number").count()).toBe(lines);
  });
});
