import { expect, test } from "@playwright/test";

test.describe("Album 组件展示中心", () => {
  test("AC-1 公开页面不请求认证接口或发送写请求", async ({ page }) => {
    const forbiddenRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const prefetchedBusinessRoute =
        url.searchParams.has("_rsc") && !["/album"].includes(url.pathname);
      if (
        url.pathname === "/api/auth/me" ||
        request.method() !== "GET" ||
        prefetchedBusinessRoute
      ) {
        forbiddenRequests.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.goto("/album?component=button");
    await expect(page.getByRole("heading", { level: 2, name: "按钮与链接操作" })).toBeVisible();

    expect(forbiddenRequests).toEqual([]);
  });

  test("AC-13 Album 操作目标与减少动效符合规范", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/album?component=button");

    const resetButton = page.getByRole("button", { name: /重置样例/ });
    const catalog = page.getByRole("complementary", { name: "组件目录" });
    const controls = (await catalog.isVisible())
      ? [
          catalog.getByRole("textbox", { name: "搜索组件" }),
          catalog.getByRole("button", { name: /按钮与链接操作Button/ }),
          resetButton,
        ]
      : [page.locator("details > summary"), resetButton];

    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await expect(control).toHaveCSS("transition-duration", "0s");
    }

    await expect(resetButton).toBeVisible();

    await page.goto("/album?component=calendar");
    const footerZIndex = await page
      .getByRole("contentinfo")
      .evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));
    const selectedDayZIndex = await page
      .locator('[data-selected-single="true"]')
      .first()
      .evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10));

    expect(footerZIndex).toBeGreaterThan(selectedDayZIndex);
  });

  test("公开访问、深链、搜索与无效链接回退", async ({ page }) => {
    await page.goto("/album?component=input-field&source=e2e");

    await expect(page.getByRole("heading", { level: 1, name: "组件展示" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "输入、复选框与字段" })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "1. 输入控件 Input / InputField / Textarea / InputGroup",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "2. 复选框与字段 Checkbox / Field / Label",
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const catalog = page.getByRole("complementary", { name: "组件目录" });
    if (await catalog.isVisible()) {
      await catalog.getByRole("textbox", { name: "搜索组件" }).fill("button");
      await catalog.getByRole("button", { name: /按钮与链接操作Button/ }).click();
    } else {
      await page.locator("details").getByText("选择组件").click();
      await page.locator("details").getByRole("textbox", { name: "搜索组件" }).fill("button");
      await page
        .locator("details")
        .getByRole("button", { name: /按钮与链接操作Button/ })
        .click();
    }

    await expect(page).toHaveURL(/component=button/);
    await expect(page).toHaveURL(/source=e2e/);
    await expect(
      page.getByRole("heading", { level: 2, name: "按钮与链接操作", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "1. 按钮 Button", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "2. 按钮组与链接 ButtonGroup / StyledLink",
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toBeVisible();
    const themeColors = await page
      .locator("[data-album-theme]")
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).backgroundColor)
      );
    expect(new Set(themeColors).size).toBe(4);

    await page.goBack();
    await expect(page).toHaveURL(/component=input-field/);
    await page.goForward();
    await expect(page).toHaveURL(/component=button/);

    await page.goto("/album?component=not-real");
    await expect(page.getByRole("status")).toContainText("已展示默认的 Button");
    await expect(
      page.getByRole("heading", { level: 2, name: "按钮与链接操作", exact: true })
    ).toBeVisible();
  });

  test("待接入组件公开说明依赖边界", async ({ page }) => {
    await page.goto("/album?component=blog");
    await expect(page.getByRole("heading", { level: 2, name: "博客组件" })).toBeVisible();
    await expect(page.getByText("为什么暂不可演示")).toBeVisible();
    await expect(page.getByText("接入条件")).toBeVisible();
  });

  test("反馈组件共享一个详情页且保留各自介绍", async ({ page }) => {
    await page.goto("/album?component=theme-switcher");

    await expect(page).toHaveURL(/component=theme-switcher/);
    await expect(page.locator("#component-title")).toHaveText("反馈与状态");
    await expect(
      page.getByRole("heading", { name: "1. 徽章与标签 Badge / Tag", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "2. 进度与消息 ProgressBar / ProMessage",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "3. 主题切换器 ThemeSwitcher", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toHaveCount(1);
  });

  test("选择器组件共享详情页并使用真实选项交互", async ({ page }) => {
    await page.goto("/album?component=select");

    await expect(page.locator("#component-title")).toHaveText("选择器");
    await expect(page.getByRole("heading", { name: "1. 固定选择 Select" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2. 搜索选择 Combobox" })).toBeVisible();

    const select = page.getByRole("combobox", { name: "默认尺寸角色选择" });
    await select.click();
    await page.getByRole("option", { name: "设计" }).click();
    await expect(page.getByText("当前角色：设计")).toBeVisible();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toHaveCount(1);
  });

  test("对话框组件共享详情页且浮层只在当前主题打开", async ({ page }) => {
    await page.goto("/album?component=dialogs");

    await expect(page.locator("#component-title")).toHaveText("对话框");
    await expect(page.getByRole("heading", { name: "1. 通用对话框 Dialog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2. 确认对话框 AlertDialog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "3. 受控弹窗 Modal" })).toBeVisible();

    const trigger = page.getByRole("button", { name: "打开通用对话框" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "组件展示说明" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.getByRole("button", { name: "打开删除确认" }).click();
    const alertDialog = page.getByRole("alertdialog");
    await alertDialog.getByRole("button", { name: "确认移除" }).click();
    await expect(page.getByText("已确认本地删除样例")).toBeVisible();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toHaveCount(1);
  });

  test("清单卡片使用本地样例并可恢复", async ({ page }) => {
    await page.goto("/album?component=checklist");

    await expect(page.locator("#component-title")).toHaveText("清单卡片");
    await expect(page.getByText("sm", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("md", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("lg", { exact: true }).first()).toBeVisible();
    const sandbox = page.getByTestId("checklist-card-sandbox");

    await sandbox.getByRole("button", { name: "删除清单" }).click();
    await expect(sandbox.getByText("清单卡片已从本地沙箱移除")).toBeVisible();
    await expect(sandbox.getByText("真实数据没有发生变化。")).toBeVisible();
    await sandbox.getByRole("button", { name: /恢复默认样例/ }).click();
    await expect(sandbox.getByRole("button", { name: "查看清单详情：版本发布检查" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toHaveCount(1);
  });

  test("清单工作流组件使用本地沙盒并打开真实详情弹窗", async ({ page }) => {
    await page.goto("/album?component=checklist-workflows");

    await expect(page.locator("#component-title")).toHaveText("清单项、表单与详情");
    await expect(
      page.getByRole("heading", { name: "1. 清单项卡片 ChecklistItemCard", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "2. 清单表单 ChecklistForm", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "3. 清单与清单项详情 ChecklistDetailDialog / ChecklistItemDetailDialog",
        exact: true,
      })
    ).toBeVisible();

    const sandbox = page.getByTestId("checklist-item-sandbox");
    const toggle = sandbox.getByRole("button", { name: "切换清单项状态：执行回归测试" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page
      .getByTestId("checklist-dialog-triggers")
      .getByRole("button", { name: "打开清单项详情" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "完成代码审查" })).toBeVisible();
    await dialog.getByRole("button", { name: "关闭" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "四主题代表形态" })).toHaveCount(1);
  });

  test("目录操作可通过键盘完成", async ({ page, isMobile }) => {
    test.skip(isMobile, "移动端使用原生 details 披露控件，主流程已在移动端用例覆盖");
    await page.goto("/album?component=button");
    const catalog = page.getByRole("complementary", { name: "组件目录" });
    const inputEntry = catalog.getByRole("button", { name: /输入、复选框与字段Input/ });
    await inputEntry.focus();
    await expect(inputEntry).toBeFocused();
    await inputEntry.press("Enter");
    await expect(page).toHaveURL(/component=input-field/);
  });
});
