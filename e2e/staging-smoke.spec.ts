import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const origin = new URL(requireEnvironment("STAGING_SMOKE_ORIGIN")).origin;
const oidcToken = requireEnvironment("VERCEL_OIDC_TOKEN");
const mode = process.env.STAGING_SMOKE_MODE ?? "public";

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function protectExactOrigin(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin !== origin) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue({
      headers: {
        ...request.headers(),
        "x-vercel-trusted-oidc-idp-token": oidcToken,
      },
    });
  });
}

async function assertPublicIdentity(page: Page): Promise<void> {
  for (const path of ["/", "/blog"]) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    expect(new URL(page.url()).origin).toBe(origin);
    await expect(page).toHaveTitle("neon cat");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-cn");
    await expect(page.locator('a[href="/blog"]').first()).toBeVisible();
    await expect(page.locator('a[href="/todo"]').first()).toBeVisible();
  }
}

test.beforeEach(async ({ context }) => {
  await protectExactOrigin(context);
});

test("protected public identity smoke", async ({ page }) => {
  await assertPublicIdentity(page);
});

test("authenticated Todo smoke and bounded cleanup", async ({ page }) => {
  test.skip(mode !== "full", "Public-only stable and recovery smoke does not receive credentials.");
  const email = requireEnvironment("E2E_USER_EMAIL");
  const password = requireEnvironment("E2E_USER_PASSWORD");
  const expectedId = requireEnvironment("E2E_USER_ID");
  const prefix = requireEnvironment("STAGING_SMOKE_PREFIX");
  const createdIds: number[] = [];
  const readRecords = async () => {
    const response = await page.request.get(
      `${origin}/api/v1/staging-smoke/todos?prefix=${encodeURIComponent(prefix)}`,
      {
        headers: { "x-vercel-trusted-oidc-idp-token": oidcToken },
        maxRedirects: 0,
      }
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      data?: {
        records?: Array<{ id: number; content: string; finished: boolean; delete: boolean }>;
      };
    };
    return body.data?.records ?? [];
  };

  await page.goto("/login?from=/todo");
  await page.getByPlaceholder("请输入邮箱").fill(email);
  await page.getByPlaceholder("请输入密码").fill(password);
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await page.waitForURL(new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/todo`));

  const identityResponse = await page.request.get(`${origin}/api/auth/me`, {
    headers: { "x-vercel-trusted-oidc-idp-token": oidcToken },
    maxRedirects: 0,
  });
  expect(identityResponse.ok()).toBe(true);
  const identity = (await identityResponse.json()) as {
    data?: { user?: { id?: string; email?: string } };
  };
  expect(identity.data?.user).toMatchObject({ id: expectedId, email });

  try {
    const orphanCleanup = await page.request.delete(`${origin}/api/v1/staging-smoke/todos`, {
      headers: {
        "content-type": "application/json",
        "x-vercel-trusted-oidc-idp-token": oidcToken,
      },
      data: { prefix: "e2e-staging-", mode: "orphan", ids: [] },
      maxRedirects: 0,
    });
    expect(orphanCleanup.ok()).toBe(true);

    await page.getByRole("button", { name: "新建" }).click();
    const editor = page.locator('[data-slot="modal-panel"]');
    await editor.locator("input").first().fill(prefix);
    await editor.getByRole("button", { name: "确定" }).click();
    await expect(page.getByRole("button", { name: prefix })).toBeVisible();

    createdIds.push(...(await readRecords()).map(({ id }) => id));
    expect(createdIds).toHaveLength(1);

    const item = page.getByRole("button", { name: prefix }).locator("..");
    await item.getByRole("button", { name: "edit" }).click();
    const editEditor = page.locator('[data-slot="modal-panel"]');
    await editEditor.locator("input").first().fill(`${prefix}-edited`);
    await editEditor.getByRole("button", { name: "确定" }).click();
    const edited = page.getByRole("button", { name: `${prefix}-edited` });
    await expect(edited).toBeVisible();
    await edited.click();
    await expect
      .poll(async () => (await readRecords()).find(({ id }) => id === createdIds[0])?.finished)
      .toBe(true);
    await edited.locator("..").getByRole("button", { name: "delete" }).click();
    await expect
      .poll(async () => (await readRecords()).find(({ id }) => id === createdIds[0])?.delete)
      .toBe(true);
  } finally {
    if (createdIds.length > 0) {
      const cleanup = await page.request.delete(`${origin}/api/v1/staging-smoke/todos`, {
        headers: {
          "content-type": "application/json",
          "x-vercel-trusted-oidc-idp-token": oidcToken,
        },
        data: { prefix, mode: "current", ids: createdIds },
        maxRedirects: 0,
      });
      expect(cleanup.ok()).toBe(true);
    }
  }
});
