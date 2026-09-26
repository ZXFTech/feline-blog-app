import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import db from "../src/db/postgres/runtime";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};
test.skip(!account.email || !account.password, "需要本地测试账号");
test.setTimeout(90_000);
test.afterAll(() => db.$disconnect());

async function expectContained(page: Page) {
  const scroll = page.getByTestId("checklist-item-scroll").last();
  await expect(scroll).toBeVisible();
  const padding = await scroll.evaluate((element) => {
    const container = element.closest("main")!;
    const style = getComputedStyle(container);
    const expected =
      Number.parseFloat(style.getPropertyValue("--spacing-panel-inset-default")) *
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      expected,
      sides: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(
        Number.parseFloat
      ),
    };
  });
  for (const side of padding.sides) expect(side).toBeCloseTo(padding.expected, 1);
  const form = page.locator("form.checklist-form-fill");
  if (await form.count()) await expect(form).toHaveAttribute("data-short", /true|false/);
  const shortForm = page.locator('form[data-short="true"]');
  const isShort = (await shortForm.count()) > 0;
  if (isShort) await scroll.scrollIntoViewIfNeeded();
  const geometry = await scroll.evaluate((element) => {
    const content = document.getElementById("content")!;
    const box = element.getBoundingClientRect();
    return {
      height: element.clientHeight,
      paddingHeight:
        Number.parseFloat(getComputedStyle(element).paddingTop) +
        Number.parseFloat(getComputedStyle(element).paddingBottom),
      top: box.top,
      bottom: box.bottom,
      viewport: innerHeight,
      contentHeight: content.clientHeight,
      contentScroll: content.scrollHeight,
      pageHeight: document.documentElement.clientHeight,
      pageScroll: document.documentElement.scrollHeight,
      overflow: getComputedStyle(element).overflowY,
    };
  });
  if (isShort) {
    const minimum = await page.evaluate(
      () => parseFloat(getComputedStyle(document.documentElement).fontSize) * 12
    );
    expect(geometry.height - geometry.paddingHeight).toBeGreaterThanOrEqual(minimum - 1);
    await expect(shortForm).toHaveCSS("overflow-y", "auto");
    await page.getByRole("button", { name: "保存", exact: true }).scrollIntoViewIfNeeded();
  } else {
    expect(geometry.height).toBeGreaterThan(geometry.paddingHeight);
  }
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport - 48);
  expect(geometry.contentScroll).toBeLessThanOrEqual(geometry.contentHeight + 1);
  expect(geometry.pageScroll).toBeLessThanOrEqual(geometry.pageHeight + 1);
  expect(geometry.overflow).toBe("auto");
}

async function expectStackedFields(page: Page) {
  const name = await page.getByLabel("清单名", { exact: true }).boundingBox();
  const themeGroup = page.getByRole("group", { name: "主题色", exact: true });
  const deadlineGroup = page.getByRole("group", { name: "截止时间", exact: true });
  const theme = await themeGroup.boundingBox();
  const deadline = await deadlineGroup.boundingBox();
  expect(name).not.toBeNull();
  expect(theme).not.toBeNull();
  expect(deadline).not.toBeNull();
  expect(theme!.y).toBeGreaterThanOrEqual(name!.y + name!.height);
  expect(deadline!.y).toBeGreaterThanOrEqual(theme!.y + theme!.height);
  expect(theme!.x).toBeCloseTo(name!.x, 1);
  expect(deadline!.x).toBeCloseTo(name!.x, 1);
  for (const group of [themeGroup, deadlineGroup]) {
    const gap = await group.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).rowGap)
    );
    expect(gap).toBeCloseTo(12, 1);
  }
}

test("detail adds at the front, cancels drafts and confines scrolling to item lists", async ({
  page,
}, info) => {
  const user = await db.user.findUniqueOrThrow({ where: { email: account.email.toLowerCase() } });
  const marker = `checklist-add-${randomUUID()}`;
  const list = await db.checklist.create({
    data: {
      name: marker,
      userId: user.id,
      createRequestId: randomUUID(),
      createPayloadHash: "0".repeat(64),
      themeColor: "#20c997",
      expiresAt: new Date(Date.now() + 86400000),
      items: {
        create: Array.from({ length: 30 }, (_, index) => ({
          detail: `测试项目 ${index}`,
          createdOrder: index + 1,
          confirmedAt: index < 10 ? new Date() : null,
        })),
      },
    },
  });
  try {
    const signedIn = await page.request.post("/api/auth/login", { data: account });
    expect(signedIn.ok()).toBe(true);
    await page.goto(`/checklists?expiry=expired&q=${encodeURIComponent(marker)}`);
    await expect(page.getByRole("heading", { name: "没有已过期的清单" })).toBeVisible();
    const resetFilters = page.getByRole("link", { name: "重置筛选" });
    await expect(resetFilters).toHaveAttribute("href", "/checklists");
    await page.screenshot({
      path: `test-results/checklist-expired-empty-${info.project.name}.png`,
    });
    await resetFilters.click();
    await expect(page).toHaveURL("/checklists");
    await page.goto(`/checklists/${list.id}`);
    await expectContained(page);
    const filters = page.getByRole("group", { name: "清单项完成状态筛选" });
    expect(await filters.evaluate((element) => element.nextElementSibling?.textContent)).toContain(
      "新增清单项"
    );
    await filters.getByRole("button", { name: "已完成", exact: true }).click();
    await expect(page.locator(".checklist-item-grid > *")).toHaveCount(10);
    await filters.getByRole("button", { name: "未完成", exact: true }).click();
    await expect(page.locator(".checklist-item-grid > *")).toHaveCount(20);
    const completingItem = page.getByRole("button", {
      name: "切换清单项状态：测试项目 10",
      exact: true,
    });
    await completingItem.click();
    await expect(completingItem).toHaveCount(0);
    await expect(page.locator(".checklist-item-grid > *")).toHaveCount(19);
    await expect(page.locator(":focus")).toHaveAttribute(
      "aria-label",
      /^切换清单项状态：测试项目 /
    );
    await filters.getByRole("button", { name: "已完成", exact: true }).click();
    await expect(page.locator(".checklist-item-grid > *")).toHaveCount(11);
    const revertingItem = page.getByRole("button", {
      name: "切换清单项状态：测试项目 10",
      exact: true,
    });
    await revertingItem.click();
    await expect(revertingItem).toHaveCount(0);
    await expect(page.locator(".checklist-item-grid > *")).toHaveCount(10);
    await filters.getByRole("button", { name: "全部", exact: true }).click();
    await expect(page.locator(".checklist-item-grid > *")).toHaveCount(30);
    await page.getByRole("button", { name: "新增清单项", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "确认增加" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("请填写清单项详情");
    await dialog.getByLabel("清单项详情").fill("取消的测试草稿");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    expect(await db.checklistItem.count({ where: { checklistId: list.id } })).toBe(30);
    await page.getByRole("button", { name: "新增清单项", exact: true }).click();
    await expect(dialog.getByLabel("清单项详情")).toHaveValue("");
    await dialog.getByLabel("清单项详情").fill("新添加的第一项");
    await dialog.getByRole("button", { name: "确认增加" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".checklist-item-grid").locator(":scope > *").first()).toContainText(
      "新添加的第一项"
    );
    await page.reload();
    await expect(page.locator(".checklist-item-grid").locator(":scope > *").first()).toContainText(
      "新添加的第一项"
    );
    expect(await db.checklistItem.count({ where: { checklistId: list.id } })).toBe(31);
    await expect(page.getByRole("button", { name: "编辑清单项", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "批量管理", exact: true }).click();
    await page.getByRole("button", { name: "选择清单项：新添加的第一项", exact: true }).click();
    await page.getByRole("button", { name: "删除清单项", exact: true }).first().click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(page.getByRole("button", { name: "删除 1 项", exact: true })).toHaveCount(0);
    await expect(page.getByText("新添加的第一项", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "编辑清单项", exact: true }).first()
    ).toBeFocused();
    await page.getByRole("button", { name: "退出批量管理", exact: true }).click();
    await page.getByRole("button", { name: "已删除项目", exact: true }).click();
    const trashDialog = page.getByRole("dialog", { name: "已删除项目" });
    await expect(trashDialog).toHaveAttribute("data-variant", "display");
    await expect(trashDialog.getByText("新添加的第一项", { exact: true })).toBeVisible();
    const trashPadding = await page.getByTestId("checklist-trash-scroll").evaluate((element) => {
      const style = getComputedStyle(element);
      const expected =
        Number.parseFloat(style.getPropertyValue("--spacing-panel-inset-default")) *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        expected,
        sides: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(
          Number.parseFloat
        ),
      };
    });
    for (const side of trashPadding.sides) expect(side).toBeCloseTo(trashPadding.expected, 1);
    await page.screenshot({ path: `test-results/checklist-trash-${info.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(trashDialog).toHaveCount(0);
    await expectContained(page);
    await page
      .getByTestId("checklist-item-scroll")
      .last()
      .evaluate((element) => {
        element.scrollTop = 500;
      });
    expect(
      await page
        .getByTestId("checklist-item-scroll")
        .last()
        .evaluate((element) => element.scrollTop)
    ).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/checklist-detail-fill-${info.project.name}.png` });
    await page.getByRole("link", { name: "编辑清单", exact: true }).click();
    await expect(page.getByLabel("清单名", { exact: true })).toBeVisible();
    await expectStackedFields(page);
    await expectContained(page);
    await page.getByRole("button", { name: "选择截止日期时间" }).click();
    await page.getByRole("combobox", { name: "小时" }).click();
    await page.getByRole("option", { name: "22", exact: true }).click();
    await page.getByRole("combobox", { name: "分钟" }).click();
    await page.getByRole("option", { name: "34", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page).toHaveURL(`/checklists/${list.id}`);
    await page.reload();
    const saved = await db.checklist.findUniqueOrThrow({ where: { id: list.id } });
    expect(saved.expiresAt.getUTCMinutes()).toBe(34);
    await page.getByRole("link", { name: "编辑清单", exact: true }).click();
    await expect(page.getByText(/22:34/)).toBeVisible();
    await page.screenshot({ path: `test-results/checklist-form-fill-${info.project.name}.png` });
    await page.goto("/checklists/new");
    await expectStackedFields(page);
    await expectContained(page);
    const form = page.locator("form.checklist-form-fill");
    await page.getByLabel("清单名", { exact: true }).fill("高度切换保留草稿");
    const width = page.viewportSize()!.width;
    await page.setViewportSize({ width, height: 1100 });
    await expect(form).toHaveAttribute("data-short", "false");
    await expectContained(page);
    await page.setViewportSize({ width, height: 620 });
    await expect(form).toHaveAttribute("data-short", "true");
    await expectContained(page);
    await expect(page.getByLabel("清单名", { exact: true })).toHaveValue("高度切换保留草稿");
  } finally {
    await db.checklist.deleteMany({ where: { id: list.id, userId: user.id, name: marker } });
  }
});
