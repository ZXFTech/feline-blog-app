import { expect, type Page } from "@playwright/test";

export interface TestAccount {
  email: string;
  password: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
}

export async function login(page: Page, account: TestAccount) {
  const response = await page.request.post("/api/auth/login", {
    data: account,
  });
  expect(response.ok()).toBe(true);
  await page.goto("/tomato");

  await expect(page).toHaveURL(/\/tomato$/);
  await expect(page.getByRole("heading", { name: "番茄钟" })).toBeVisible();
}

export async function currentUser(page: Page): Promise<AuthenticatedUser> {
  const response = await page.request.get("/api/auth/me");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    data: { user: AuthenticatedUser | null };
  };
  expect(body.data.user).not.toBeNull();
  return body.data.user!;
}

export async function logout(page: Page) {
  const response = await page.request.post("/api/auth/logout");
  expect(response.ok()).toBe(true);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
}
