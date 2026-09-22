import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("AC-14 caps the shared main track at 96rem and centers the complete rail group", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 900 });
  const source = await readFile(path.resolve("src/app/globals.css"), "utf8");
  const contentStart = source.indexOf(".content-container");
  const contentEnd = source.indexOf(".flip-clock", contentStart);
  const token = (name: string) => source.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  expect(contentStart).toBeGreaterThanOrEqual(0);
  expect(contentEnd).toBeGreaterThan(contentStart);
  expect(token("container-content")).toBe("96rem");

  await page.setContent(`
    <style>
      html, body { margin: 0; }
      ${source.slice(contentStart, contentEnd)}
      .content-container {
        --container-content: ${token("container-content")};
        --spacing-sidebar-left: ${token("spacing-sidebar-left")};
        --spacing-sidebar-right: ${token("spacing-sidebar-right")};
        --spacing-content-gap: ${token("spacing-content-gap")};
        width: 2560px;
      }
    </style>
    <div class="content-container">
      <div class="content-grid" data-has-left="true" data-has-right="true">
        <main class="content"></main>
        <aside class="right-side-bar"></aside>
        <aside class="left-side-bar"></aside>
      </div>
    </div>
  `);

  const group = await page.locator(".content-grid").evaluate((element) => {
    const main = element.querySelector(".content")!.getBoundingClientRect();
    const left = element.querySelector(".left-side-bar")!.getBoundingClientRect();
    const right = element.querySelector(".right-side-bar")!.getBoundingClientRect();
    return { left: left.left, width: right.right - left.left, mainWidth: main.width };
  });

  expect(group.width).toBe(2236);
  expect(group.left).toBe(162);
  expect(group.mainWidth).toBe(1536);
});

test("AC-3 keeps double-layout history bounded and independently scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const source = await readFile(path.resolve("src/app/globals.css"), "utf8");
  const contentStart = source.indexOf(".content-container");
  const contentEnd = source.indexOf(".flip-clock", contentStart);
  expect(contentStart).toBeGreaterThanOrEqual(0);
  expect(contentEnd).toBeGreaterThan(contentStart);
  const contentCss = source.slice(contentStart, contentEnd);
  const token = (name: string) => source.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  await page.setContent(`
    <style>
      html, body { margin: 0; }
      .content-container {
        --container-content: ${token("container-content")};
        --spacing-sidebar-left: ${token("spacing-sidebar-left")};
        --spacing-sidebar-right: ${token("spacing-sidebar-right")};
        --spacing-content-gap: ${token("spacing-content-gap")};
        width: 1200px;
      }
      .left-side-bar, .right-side-bar { padding: 88px 8px 56px; }
      .history-panel { display: flex; height: 100%; min-height: 0; flex-direction: column; }
      .history-header { flex: none; height: 120px; }
      .history-scroll { min-height: 0; flex: 1; overflow-y: auto; }
      .history-item { height: 100px; }
      ${contentCss}
    </style>
    <div class="content-container">
      <div class="content-grid" data-has-left="true" data-has-right="true">
        <main class="content"></main>
        <aside class="right-side-bar"><div style="height: 300px"></div></aside>
        <aside class="left-side-bar">
          <section class="history-panel">
            <div class="history-header"></div>
            <div class="history-scroll">
              ${Array.from({ length: 12 }, () => '<div class="history-item"></div>').join("")}
            </div>
          </section>
        </aside>
      </div>
    </div>
  `);

  const dimensions = await page.locator(".history-scroll").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  const leftHeight = await page
    .locator(".left-side-bar")
    .evaluate((element) => element.getBoundingClientRect().height);

  expect(leftHeight).toBeLessThanOrEqual(900);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
});

test("AC-2 hides native scrollbars without disabling scrolling", async ({ page }, testInfo) => {
  await page.goto("/album");
  await page.evaluate(() => {
    const region = document.createElement("div");
    region.setAttribute("data-scroll-test", "true");
    region.tabIndex = 0;
    Object.assign(region.style, {
      height: "100px",
      overflowY: "auto",
      width: "200px",
    });
    const content = document.createElement("div");
    content.style.height = "1000px";
    region.append(content);
    document.body.append(region);
  });

  const region = page.locator("[data-scroll-test]");
  await expect(region).toBeVisible();
  const scrollbarDisplay = await region.evaluate(
    (element) => getComputedStyle(element, "::-webkit-scrollbar").display
  );
  expect(scrollbarDisplay).toBe("none");

  if (testInfo.project.name === "mobile") {
    await region.evaluate((element) => element.scrollTo({ top: 500 }));
  } else {
    await region.hover();
    await page.mouse.wheel(0, 500);
  }
  await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
