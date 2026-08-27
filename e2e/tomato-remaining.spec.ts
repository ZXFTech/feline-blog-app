import { expect, test } from "@playwright/test";
import db from "../src/db/client";
import { currentUser, login, type TestAccount } from "./pomodoro-helpers";

const primary: TestAccount = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

test.skip(!primary.email || !primary.password, "需要主测试账号凭据");

test.afterAll(async () => {
  await db.$disconnect();
});

function eventIdFor(projectName: string, suffix: string) {
  const project = projectName === "mobile" ? "2" : "1";
  return `019d3b54-2e18-7000-8000-000000000${project}${suffix}`;
}

test("covers: AC-3, restores one expired phase and syncs it once", async ({
  page,
}, testInfo) => {
  await login(page, primary);
  const user = await currentUser(page);
  const eventId = eventIdFor(testInfo.project.name, "01");
  const endAt = Date.now() - 500;
  const startAt = endAt - 1_200;

  await db.pomodoroRecord.deleteMany({ where: { userId: user.id, eventId } });
  await page.evaluate(
    ({ userId, eventId, startAt, endAt }) => {
      localStorage.setItem(
        `pomodoro:v2:timer:${userId}`,
        JSON.stringify({
          schemaVersion: 2,
          userId,
          state: {
            phase: "focus",
            run: "running",
            remainingMs: 1_200,
            startAt,
            endAt,
            activeEventId: eventId,
            pendingOutcome: null,
            completedFocus: 0,
            settings: {
              focusMin: 0.02,
              shortBreakMin: 5,
              longBreakMin: 10,
              longBreakEvery: 4,
              autoStartNext: false,
              mute: true,
              volume: 0,
            },
          },
        }),
      );
    },
    { userId: user.id, eventId, startAt, endAt },
  );

  try {
    await page.reload();
    await expect(
      page.getByText("目标 00:02", { exact: true }).first(),
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText("短休息", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        db.pomodoroRecord.count({ where: { userId: user.id, eventId } }),
      )
      .toBe(1);
    await expect(
      page.getByText("已同步", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await db.pomodoroRecord.deleteMany({ where: { userId: user.id, eventId } });
  }
});

test("covers: AC-5, pauses an invalid queued result with an actionable status", async ({
  page,
}, testInfo) => {
  await login(page, primary);
  const user = await currentUser(page);
  const eventId = eventIdFor(testInfo.project.name, "02");
  const now = new Date().toISOString();

  await page.evaluate(
    ({ userId, eventId, now }) => {
      localStorage.setItem(
        `pomodoro:v2:outbox:${userId}:${eventId}`,
        JSON.stringify({
          schemaVersion: 2,
          userId,
          eventId,
          payload: {
            eventId,
            type: "FOCUS",
            endReason: "COMPLETED",
            startAt: now,
            endAt: now,
            targetDurationMs: 0,
            remainingMs: 0,
          },
          createdAt: now,
          retryCount: 0,
          nextAttemptAt: 0,
          lastError: null,
          status: "pending",
        }),
      );
    },
    { userId: user.id, eventId, now },
  );

  await page.reload();

  await expect(page.getByText("同步暂停", { exact: true })).toBeVisible({
    timeout: 8_000,
  });
  await expect(
    page.getByRole("status").filter({ hasText: "1 条需处理" }),
  ).toBeVisible();
});

test("covers: AC-8, keeps the in-memory outcome when writing the outbox fails", async ({
  page,
}) => {
  await login(page, primary);
  await page.getByRole("spinbutton", { name: "专注分钟" }).focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("1");
  await page.keyboard.press("Tab");

  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("pomodoro:v2:outbox:")) {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.getByRole("button", { name: "开始专注" }).click();
  await page.getByRole("button", { name: "跳过" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "计时结果尚未安全保存" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "开始专注" })).toBeDisabled();
});

test("covers: AC-2 and AC-4, syncs two independent queued events exactly once", async ({
  page,
}, testInfo) => {
  await login(page, primary);
  const user = await currentUser(page);
  const firstEventId = eventIdFor(testInfo.project.name, "03");
  const secondEventId = eventIdFor(testInfo.project.name, "04");
  const now = Date.now();

  await db.pomodoroRecord.deleteMany({
    where: { userId: user.id, eventId: { in: [firstEventId, secondEventId] } },
  });
  await page.evaluate(
    ({ userId, eventIds, now }) => {
      eventIds.forEach((eventId, index) => {
        const endAt = new Date(now - index * 2_000).toISOString();
        const startAt = new Date(now - index * 2_000 - 1_200).toISOString();
        localStorage.setItem(
          `pomodoro:v2:outbox:${userId}:${eventId}`,
          JSON.stringify({
            schemaVersion: 2,
            userId,
            eventId,
            payload: {
              eventId,
              type: "FOCUS",
              endReason: "COMPLETED",
              startAt,
              endAt,
              targetDurationMs: 1_200,
              remainingMs: 0,
            },
            createdAt: endAt,
            retryCount: 0,
            nextAttemptAt: 0,
            lastError: null,
            status: "pending",
          }),
        );
      });
    },
    { userId: user.id, eventIds: [firstEventId, secondEventId], now },
  );

  try {
    await page.reload();
    await expect(
      page.getByRole("status").filter({ hasText: "0 条待同步" }),
    ).toBeVisible({ timeout: 12_000 });
    await expect
      .poll(() =>
        db.pomodoroRecord.count({
          where: {
            userId: user.id,
            eventId: { in: [firstEventId, secondEventId] },
          },
        }),
      )
      .toBe(2);
  } finally {
    await db.pomodoroRecord.deleteMany({
      where: {
        userId: user.id,
        eventId: { in: [firstEventId, secondEventId] },
      },
    });
  }
});
