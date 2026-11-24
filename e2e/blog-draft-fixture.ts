import {
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { PrismaClient } from "../generated/prisma-postgres/client";

const site = "https://blog.user-center.test:3446";
const center = "https://127.0.0.1:3447";
const accounts = {
  author: { email: "author@drafts.example.test", role: "ROOT" },
  other: { email: "other@drafts.example.test", role: "ROOT" },
  reader: { email: "reader@drafts.example.test", role: "USER" },
} as const;

export const isDraftFixtureEnabled = process.env.BLOG_DRAFT_E2E_ORIGIN === site;

export function newDraftFixtureContext(browser: Browser, options: BrowserContextOptions) {
  return browser.newContext({
    ...options,
    baseURL: site,
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:3448", bypass: "127.0.0.1" },
  });
}

export function openDraftFixtureDatabase() {
  const connectionString = process.env.BLOG_DRAFT_E2E_DATABASE_URL;
  const caFile = process.env.BLOG_DRAFT_E2E_CA_FILE;
  if (!isDraftFixtureEnabled || !connectionString || !caFile) {
    throw new Error("Blog drafts E2E database fixture is required.");
  }
  const url = new URL(connectionString);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55446" ||
    url.pathname !== "/feline_blog_sdk_dev" ||
    url.username !== "blog_sdk_migrator" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Only the disposable blog drafts SDK database is supported.");
  }
  const adapter = new PrismaPg({
    connectionString,
    ssl: { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true },
  });
  return new PrismaClient({ adapter });
}

async function signInSlot() {
  const ca = process.env.BLOG_DRAFT_E2E_CA_FILE;
  if (!ca) throw new Error("The disposable fixture CA is required.");
  const directory = path.dirname(realpathSync(ca));
  const root = realpathSync(".feline-blog/blog-drafts-e2e");
  if (path.dirname(directory) !== root || !path.basename(directory).startsWith("fixture-")) {
    throw new Error("The sign-in counter must stay in the current disposable fixture.");
  }
  const counter = path.join(directory, "sign-in-counter");
  const [lastRequest, consecutive] = existsSync(counter)
    ? readFileSync(counter, "utf8").split(" ").map(Number)
    : [0, 0];
  // Better Auth v1.7.12 permits three starts in the shared loopback bucket and
  // resets after 10 seconds of inactivity. Keep the test worker inside that limit.
  const resetAfter = 10_100 - (Date.now() - lastRequest);
  const fresh = resetAfter <= 0 || consecutive >= 3;
  if (consecutive >= 3 && resetAfter > 0) await setTimeout(resetAfter);
  return () => {
    writeFileSync(counter, `${Date.now()} ${fresh ? 1 : consecutive + 1}`, { mode: 0o600 });
  };
}

export async function signInDraftFixture(context: BrowserContext, account: keyof typeof accounts) {
  if (!isDraftFixtureEnabled) throw new Error("Blog drafts SDK fixture is required.");
  await context.addCookies([
    { name: "draft_fixture_account", value: account, url: center, secure: true, httpOnly: true },
  ]);
  const page = await context.newPage();
  try {
    await page.goto(site + "/login");
    const recordSignIn = await signInSlot();
    const started = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/sign-in/social"
    );
    await page.getByRole("button", { name: "使用用户中心登录" }).click();
    const login = await started;
    recordSignIn();
    expect(login.status(), "SDK sign-in must accept the synthetic test issuer").toBe(200);
    await expect(page).toHaveURL(site + "/profile", { timeout: 30_000 });
    const response = await page.request.get(site + "/api/me");
    expect(response.ok()).toBe(true);
    const { data } = await response.json();
    expect(data).toMatchObject({
      user: accounts[account],
      installation: { phase: "ready" },
    });
    expect(data.user.id).toEqual(expect.any(String));
    return { id: data.user.id as string };
  } finally {
    await page.close();
  }
}
