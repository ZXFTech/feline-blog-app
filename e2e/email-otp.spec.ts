import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const enabled = !!process.env.FELINE_AUTH_FIXTURE_FILE;
const fixture = enabled ? JSON.parse(readFileSync(process.env.FELINE_AUTH_FIXTURE_FILE!, "utf8")) : null;
const origin = "https://auth.zhaosie.com";
test.skip(!enabled, "Requires the dedicated isolated OTP fixture");
test.describe.configure({ mode: "serial" });
let center: Pool, blog: Pool;
test.beforeAll(() => {
  if (!enabled) return;
  if (fixture.owner !== "oauth-post-20261019" || fixture.mailpitOrigin !== "http://localhost:18249") throw Error("OWNED_LOCAL_FIXTURE_REQUIRED");
  for (const value of [fixture.centerAdmin, fixture.blogAdmin]) {
    const url = new URL(value);
    if (url.hostname !== "127.0.0.1" || url.port !== "54346") throw Error("OWNED_LOCAL_DATABASE_REQUIRED");
  }
  center = new Pool({ connectionString: fixture.centerAdmin, max: 1 });
  blog = new Pool({ connectionString: fixture.blogAdmin, max: 1 });
});
test.beforeEach(async () => { await center.query("DELETE FROM rate_limit"); });
test.afterAll(async () => { await center?.end(); await blog?.end(); });
const post = (request: APIRequestContext, path: string, data: object) => request.post(origin + path, { headers: { Origin: origin }, data: { ...data, ...(["/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/v1/auth/otp/verify/confirm", "/api/v1/auth/otp/reset/confirm"].includes(path) ? { flowContext: { kind: "none" } } : {}) } });
async function mail(request: APIRequestContext, email: string, purpose: "verify" | "reset") {
  let id = "";
  await expect.poll(async () => {
    const result = await (await request.get(fixture.mailpitOrigin + "/api/v1/messages")).json();
    id = result.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => item.To.some(to => to.Address === email) && item.Subject.includes(purpose === "reset" ? "重置" : "验证"))?.ID ?? "";
    return !!id;
  }).toBe(true);
  const value = await (await request.get(fixture.mailpitOrigin + "/api/v1/message/" + id)).json();
  const otp = value.Text.match(/验证码：([0-9]{6})/)?.[1] as string;
  const link = new URL(value.Text.match(/https:\/\/auth.zhaosie.com\/auth\/(?:verify-email|reset-password)\?[^\s]+/)[0]);
  expect(otp?.length).toBe(6);
  expect([...link.searchParams.keys()]).toEqual(["app"]);
  return { otp, link };
}

for (const theme of ["light", "dark"] as const) {
  test(`OTP reset UI rejects wrong input, revokes the old session and requires login in ${theme}`, async ({ page }, info) => {
    const subject = randomUUID(), email = `otp-ui-${subject}@user-center.test`;
    await center.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,\'OTP 表单回归\',$2,true)', [subject, email]);
    await center.query("INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) SELECT $1,$2,'credential',$2,password,now() FROM account WHERE user_id=$3 AND provider_id='credential'", [randomUUID(), subject, fixture.fixtures.center.id]);
    expect((await post(page.request, "/api/auth/sign-in/email", { email, password: fixture.fixtures.password })).status()).toBe(200);
    await page.addInitScript(value => localStorage.setItem("theme", value), theme);
    await page.goto(origin + "/auth/forgot-password");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await page.screenshot({ path: `.feline-blog/${info.project.name}-otp-recovery-${theme}.png` });
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByRole("button", { name: "申请恢复验证码", exact: true }).click();
    await page.waitForURL(origin + "/auth/reset-password");
    const issued = await mail(page.request, email, "reset");
    expect(new URL(page.url()).search).toBe("");
    const password = fixture.fixtures.password + "-UI-reset";
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByLabel("六位验证码", { exact: true }).fill(issued.otp);
    await page.getByLabel("新密码", { exact: true }).fill(password);
    await page.getByLabel("确认新密码", { exact: true }).fill(password + "mismatch");
    await page.getByRole("button", { name: "确认重置密码", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "两次输入的密码不一致。" })).toHaveText("两次输入的密码不一致。");
    expect((await page.request.get(origin + "/api/v1/session")).status()).toBe(200);
    const wrong = issued.otp.slice(0, 5) + String((Number(issued.otp[5]) + 1) % 10);
    await page.getByLabel("六位验证码", { exact: true }).fill(wrong);
    await page.getByLabel("确认新密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "确认重置密码", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "验证码或输入无效，请检查后重试，必要时重新申请。" })).toHaveText("验证码或输入无效，请检查后重试，必要时重新申请。");
    expect((await page.request.get(origin + "/api/v1/session")).status()).toBe(200);
    await page.getByLabel("六位验证码", { exact: true }).fill(issued.otp);
    await page.getByRole("button", { name: "确认重置密码", exact: true }).click();
    await page.waitForURL(origin + "/auth/sign-in");
    expect((await page.request.get(origin + "/api/v1/session")).status()).toBe(401);
    expect((await post(page.request, "/api/auth/sign-in/email", { email, password: fixture.fixtures.password })).status()).toBe(401);
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(origin + "/");
    expect((await page.request.get(origin + "/api/v1/session")).status()).toBe(200);
  });

  test(`OTP in a new browser returns only the fixed blog entry and cannot bind an account in ${theme}`, async ({ page, browser }, info) => {
    const email = `otp-other-browser-${randomUUID()}@user-center.test`;
    expect((await post(page.request, "/api/auth/sign-up/email", { email, name: "跨浏览器 OTP 回归", password: fixture.fixtures.password })).status()).toBe(200);
    const subject = (await center.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0].id;
    const issued = await mail(page.request, email, "verify");
    const peer = await browser.newContext();
    try {
      const other = await peer.newPage();
      await other.addInitScript(value => localStorage.setItem("theme", value), theme);
      await other.goto(origin + "/auth/verify-email?app=feline-blog");
      await expect(other.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await other.screenshot({ path: `.feline-blog/${info.project.name}-otp-verify-${theme}.png` });
      expect((await peer.request.get(origin + "/api/v1/session")).status()).toBe(401);
      await other.getByLabel("邮箱", { exact: true }).fill(email);
      await other.getByRole("button", { name: "申请或重发验证码", exact: true }).click();
      await expect(other.getByRole("alert").filter({ hasText: "操作暂不可用，请按提示稍后重试。" })).toHaveText("操作暂不可用，请按提示稍后重试。");
      await expect(other.getByRole("button", { name: /秒后可重新申请/ })).toBeDisabled();
      await other.getByLabel("六位验证码", { exact: true }).fill(issued.otp);
      await other.getByRole("button", { name: "验证并继续", exact: true }).click();
      await other.waitForURL("https://blog.zhaosie.com/login");
      expect((await peer.request.get(origin + "/api/v1/session")).status()).toBe(200);
      expect((await peer.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(401);
      expect((await blog.query("SELECT count(*)::int n FROM users WHERE email=$1", [email])).rows[0].n).toBe(0);
      expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [subject])).rows[0].n).toBe(0);
      const replay = await post(page.request, "/api/v1/auth/otp/verify/confirm", { email, otp: issued.otp, app: "feline-blog" });
      expect(replay.status()).toBe(400);
      expect(replay.headers()["set-cookie"]).toBeUndefined();
      expect((await page.request.get(origin + "/api/v1/session")).status()).toBe(401);
    } finally { await peer.close(); }
  });
}
