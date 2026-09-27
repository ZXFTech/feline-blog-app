import { expect, test, type Locator, type Page } from "@playwright/test";

const account = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

test.skip(!account.email || !account.password, "需要本地测试账号");

async function expectWheelChains(page: Page, scroll: Locator, content: Locator) {
  await scroll.hover();
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    const form = element.closest("form")!;
    form.scrollTop = form.scrollHeight;
  });
  await content.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.mouse.wheel(0, 400);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await scroll.hover();
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
    element.closest("form")!.scrollTop = 0;
  });
  await content.evaluate((element) => {
    element.scrollTop = 400;
  });
  await page.mouse.wheel(0, -400);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeLessThan(400);
}

test("empty checklist items have no card-sized gap and wheel scrolling reaches the page", async ({
  page,
}) => {
  const signedIn = await page.request.post("/api/auth/login", { data: account });
  expect(signedIn.ok()).toBe(true);
  const mobile = test.info().project.name === "mobile";
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: 620 });
  await page.goto("/checklists/new");

  const form = page.locator("form.checklist-form-fill");
  const scroll = page.getByTestId("checklist-item-scroll");
  const emptyMessage = page.getByText("尚未添加项目。请先在上方填写详情并点击添加。");
  await expect(form).toHaveAttribute("data-short", "true");
  const emptyGap = await scroll.evaluate((element) => {
    const message = element.querySelector("p")!;
    return (
      element.getBoundingClientRect().bottom -
      message.getBoundingClientRect().bottom -
      Number.parseFloat(getComputedStyle(element).paddingBottom)
    );
  });
  expect(emptyGap).toBeLessThan(4);
  await expect(emptyMessage).toBeVisible();
  const actionsGap = await scroll.evaluate((element) => {
    const save = element
      .closest("form")!
      .querySelector<HTMLButtonElement>('button[type="submit"]')!;
    return save.getBoundingClientRect().top - element.getBoundingClientRect().bottom;
  });
  expect(actionsGap).toBeLessThan(80);
  if (mobile) return;

  await page.setViewportSize({ width: 1280, height: 1100 });
  await expect(form).toHaveAttribute("data-short", "false");
  const tallGap = await scroll.evaluate((element) => {
    const message = element.querySelector("p")!;
    return (
      element.getBoundingClientRect().bottom -
      message.getBoundingClientRect().bottom -
      Number.parseFloat(getComputedStyle(element).paddingBottom)
    );
  });
  expect(tallGap).toBeLessThan(4);
  await page.setViewportSize({ width: 1280, height: 620 });
  await expect(form).toHaveAttribute("data-short", "true");

  await page.locator("#content").evaluate((element) => {
    const spacer = document.createElement("div");
    spacer.style.height = "1000px";
    element.append(spacer);
  });
  const content = page.locator("#content");
  await expectWheelChains(page, scroll, content);

  await page.getByRole("textbox", { name: "清单项详情" }).fill("待确认项目");
  await expectWheelChains(page, scroll, content);
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("已添加清单项（1）")).toBeVisible();
  await expectWheelChains(page, scroll, content);
});
