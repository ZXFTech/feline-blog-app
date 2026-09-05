import { expect, test } from '@playwright/test';
import db from '../src/db/client';
import { PomodoroEndReason, PomodoroType } from '../generated/prisma/enums';
import { currentUser, login, logout, type TestAccount } from './pomodoro-helpers';

const primary: TestAccount = {
  email: process.env.E2E_USER_EMAIL ?? '',
  password: process.env.E2E_USER_PASSWORD ?? '',
};
const secondary: TestAccount = {
  email: process.env.E2E_OTHER_USER_EMAIL ?? '',
  password: process.env.E2E_OTHER_USER_PASSWORD ?? '',
};

test.skip(!primary.email || !primary.password, '需要主测试账号凭据');
test.skip(!secondary.email || !secondary.password, '需要第二测试账号凭据');

test.afterAll(async () => {
  await db.$disconnect();
});

test('covers: AC-8, blocks starting when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pomodoro:')) {
        throw new DOMException('Storage unavailable', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await login(page, primary);

  await expect(page.getByRole('alert').filter({ hasText: '浏览器存储不可用' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始专注' })).toBeDisabled();
});

test('covers: AC-8, quarantines corrupt timer data and recovers safely', async ({ page }) => {
  await login(page, primary);
  const user = await currentUser(page);

  await page.addInitScript(
    ({ userId }) => {
      const marker = `pomodoro:e2e:corrupt:${userId}`;
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(`pomodoro:v2:timer:${userId}`, '{broken-json');
        sessionStorage.setItem(marker, '1');
      }
    },
    { userId: user.id }
  );
  await page.reload();

  await expect(
    page.getByRole('status').filter({ hasText: '无法恢复的计时数据已隔离' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '开始专注' })).toBeEnabled();
});

test('covers: AC-4, keeps an offline result visible and syncs it after reconnecting', async ({
  page,
  context,
}) => {
  await login(page, primary);
  await page.getByRole('spinbutton', { name: '专注分钟' }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('0.02');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: '开始专注' }).click();

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: '1 条待同步' })).toBeVisible({
    timeout: 8_000,
  });
  await expect.soft(page.getByText('目标 00:02', { exact: true }).first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByLabel('已同步', { exact: true }).first()).toBeVisible({
    timeout: 12_000,
  });
  await expect(page.getByRole('status').filter({ hasText: '0 条待同步' })).toBeVisible();
});

test('covers: AC-7, isolates and restores timer state when switching users', async ({ page }) => {
  await login(page, primary);
  await page.getByRole('spinbutton', { name: '专注分钟' }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('7');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('spinbutton', { name: '专注分钟' })).toHaveValue('7');
  await page.getByRole('button', { name: '开始专注' }).click();
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
  await page.getByRole('button', { name: '暂停' }).click();
  const primaryRemaining = await page.getByLabel(/剩余时间/).getAttribute('aria-label');

  await logout(page);
  await login(page, secondary);
  const secondaryMain = page.getByRole('main', { name: '番茄钟' });
  await expect(secondaryMain.getByLabel('剩余时间 25:00')).toBeVisible();
  await expect(secondaryMain.getByRole('button', { name: '开始专注' })).toBeEnabled();

  await logout(page);
  await login(page, primary);
  const restoredMain = page.getByRole('main', { name: '番茄钟' });
  await expect(restoredMain.getByRole('button', { name: '继续' })).toBeVisible({ timeout: 12_000 });
  await expect(restoredMain.getByLabel(primaryRemaining!)).toBeVisible({
    timeout: 12_000,
  });
});

test('covers: AC-5, shows a server conflict and adopts the first record', async ({
  page,
}, testInfo) => {
  const eventId =
    testInfo.project.name === 'mobile'
      ? '019d3b54-2e18-7000-8000-000000000102'
      : '019d3b54-2e18-7000-8000-000000000101';
  await page.addInitScript((fixedEventId) => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => fixedEventId,
    });
  }, eventId);

  await login(page, primary);
  const user = await currentUser(page);
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - 60_000);

  await db.pomodoroRecord.deleteMany({ where: { userId: user.id, eventId } });
  await db.pomodoroRecord.create({
    data: {
      userId: user.id,
      eventId,
      type: PomodoroType.FOCUS,
      endReason: PomodoroEndReason.COMPLETED,
      finished: true,
      summary: '',
      startAt,
      endAt,
      durationMs: 60_000,
      actualDurationMs: 60_000,
    },
  });

  try {
    await page.getByRole('button', { name: '开始专注' }).click();
    await page.getByRole('button', { name: '跳过' }).click();

    await expect(page.getByLabel('存在冲突', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '采用服务端记录' }).click();
    await expect(page.getByLabel('存在冲突', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('已同步', { exact: true }).first()).toBeVisible();
  } finally {
    await db.pomodoroRecord.deleteMany({ where: { userId: user.id, eventId } });
  }
});
