import { expect, test, type Locator } from "@playwright/test";

async function measureGrid(grid: Locator) {
  return grid.evaluate((element) => {
    const style = getComputedStyle(element);
    const wrapper = element.parentElement!;
    const cards = Array.from(element.children).map((child) => {
      const card = child.tagName === "LI" ? child.firstElementChild! : child;
      const box = card.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    return {
      width: element.getBoundingClientRect().width,
      left: element.getBoundingClientRect().left,
      gap: Number.parseFloat(style.columnGap),
      minimum: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 12,
      wrapperWidth: wrapper.clientWidth,
      wrapperScrollWidth: wrapper.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      cards,
    };
  });
}

async function expectGeometry(grid: Locator) {
  await expect(async () => {
    const geometry = await measureGrid(grid);
    const { width, gap, minimum, cards } = geometry;
    const columns = Math.min(
      cards.length,
      Math.max(1, Math.floor((width + gap) / (minimum + gap)))
    );
    expect(gap).toBeCloseTo(minimum / 16, 1);
    expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.pageWidth);
    if (!cards.length) return;
    expect(cards.filter((card) => Math.abs(card.y - cards[0].y) < 1)).toHaveLength(columns);
    for (const [index, card] of cards.entries()) {
      expect(card.width).toBeGreaterThanOrEqual(minimum - 0.1);
      expect(card.height).toBeCloseTo(card.width, 1);
      const maximum = (minimum * 12.5) / 12;
      expect(card.width).toBeLessThanOrEqual(maximum + 0.1);
      expect(card.width).toBeCloseTo(Math.min(maximum, (width - gap * (columns - 1)) / columns), 1);
      expect(card.x).toBeCloseTo(cards[index % columns].x, 1);
      if (index > 0 && index < columns) {
        expect(card.x - cards[index - 1].x - cards[index - 1].width).toBeCloseTo(gap, 1);
      }
    }
    const occupied = columns * cards[0].width + (columns - 1) * gap;
    expect(cards[0].x - geometry.left).toBeCloseTo((width - occupied) / 2, 1);
  }).toPass({ timeout: 3000, intervals: [50] });
}

for (const mode of ["创建模式", "编辑模式"] as const) {
  test(`AC-19/25 ${mode} uses square auto-fit tracks and contains narrow overflow`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/album?component=checklist-workflows");
    const sandbox = page.getByTestId("checklist-form-sandbox");
    await sandbox.getByRole("button", { name: mode, exact: true }).click();
    const grid = sandbox.locator(".checklist-item-grid");
    await expect(grid).toBeVisible();

    // Exercise the production form with one/two items before filling multiple rows.
    await expectGeometry(grid);
    if (mode === "创建模式") {
      await grid.getByRole("button", { name: "删除清单项" }).click();
      await page.getByRole("button", { name: "确认删除", exact: true }).click();
      await expect(grid.locator(":scope > li")).toHaveCount(0);
      await expectGeometry(grid);
    }
    const initialCount = await grid.locator(":scope > li").count();
    for (let index = initialCount; index < 7; index += 1) {
      await sandbox
        .getByRole("textbox", { name: "清单项详情", exact: true })
        .fill(
          index === 6
            ? "https://example.com/" + "long-content".repeat(80)
            : `网格验收项目 ${index + 1}`
        );
      await sandbox.getByRole("button", { name: "添加", exact: true }).click();
      await expectGeometry(grid);
    }
    await expect(grid.locator(":scope > li")).toHaveCount(7);

    for (const rootSize of [16, 20]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}px`;
      }, rootSize);
      const minimum = rootSize * 12;
      const gap = rootSize * 0.75;
      for (const columns of [4, 3, 2]) {
        const threshold = columns * minimum + (columns - 1) * gap;
        for (const width of [threshold + 24, threshold, threshold - 1]) {
          await grid.evaluate((element, value) => {
            const wrapper = element.parentElement!;
            const style = getComputedStyle(wrapper);
            const padding =
              Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
            wrapper.style.width = `${value + padding}px`;
          }, width);
          await expectGeometry(grid);
        }
      }
      await grid.evaluate((element, width) => {
        element.parentElement!.style.width = `${width}px`;
      }, minimum - 20);
      await expectGeometry(grid);
      const narrow = await measureGrid(grid);
      expect(narrow.wrapperScrollWidth).toBeGreaterThan(narrow.wrapperWidth);
      expect(narrow.cards[0].width).toBeCloseTo(minimum, 1);
    }

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "16px";
    });
    await grid.evaluate((element) => {
      element.parentElement!.style.width = "";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ["light", "dark", "sugar", "warm"]) {
      await page.evaluate((value) => {
        document.documentElement.className = value;
      }, theme);
      await expectGeometry(grid);
    }
    await grid.locator("..").screenshot({
      path: `test-results/checklist-grid-${mode === "创建模式" ? "create" : "edit"}.png`,
    });
  });
}
