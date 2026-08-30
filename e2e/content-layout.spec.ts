import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import * as sass from 'sass';

test('AC-3 keeps double-layout history bounded and independently scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const source = await readFile(path.resolve('src/components/Content/_styles.scss'), 'utf8');
  const contentCss = sass.compileString(source).css;
  await page.setContent(`
    <style>
      html, body { margin: 0; }
      .content-container { width: 1200px; }
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
              ${Array.from({ length: 12 }, () => '<div class="history-item"></div>').join('')}
            </div>
          </section>
        </aside>
      </div>
    </div>
  `);

  const dimensions = await page.locator('.history-scroll').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  const leftHeight = await page
    .locator('.left-side-bar')
    .evaluate((element) => element.getBoundingClientRect().height);

  expect(leftHeight).toBeLessThanOrEqual(900);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
});
