import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { authPost, capturedCenterFlow } from "./auth-helpers";
const enabled = !!process.env.FELINE_AUTH_FIXTURE_FILE;
const fixture = enabled ? JSON.parse(readFileSync(process.env.FELINE_AUTH_FIXTURE_FILE!, "utf8")) : null;
const mailpitOrigin = fixture?.mailpitOrigin;
test.skip(!enabled, "Requires the dedicated isolated fixture runner");
test.describe.configure({ mode: "serial" });
let blog: Pool, center: Pool;
test.beforeAll(async () => { if (enabled) {
  if (mailpitOrigin !== "http://localhost:18249") throw new Error("Dedicated isolated mail fixture required");
  for (const value of [fixture.blogAdmin, fixture.centerAdmin]) {
    const url = new URL(value); if (url.hostname !== "127.0.0.1" || url.port !== "54346") throw new Error("Dedicated isolated fixture required");
  }
  blog = new Pool({ connectionString: fixture.blogAdmin, max: 1 }); center = new Pool({ connectionString: fixture.centerAdmin, max: 1 });
} });
test.afterAll(async () => { await blog?.end(); await center?.end(); });
test.beforeEach(async () => {
  // Reset only disposable fixture counters, so previous runs share no budget.
  await blog.query("DELETE FROM feline_auth_rate"); await center.query("DELETE FROM rate_limit");
});
async function account() {
  const suffix = randomUUID(), user = randomUUID(), subject = randomUUID();
  const email = `old-${suffix}@user-center.test`, centerEmail = `center-${suffix}@user-center.test`;
  await blog.query('INSERT INTO users(id,email,username,password,role,avatar,work,"updateAt") SELECT $1,$2,\'原博客昵称\',password,\'ROOT\',\'/myCat.jpg\',\'绑定前资料\',now() FROM users WHERE id=$3', [user, email, fixture.fixtures.e2eRoot.id]);
  const article = (await blog.query('INSERT INTO "Blog"("authorId",title,content,"updatedAt") VALUES($1,\'绑定验收文章\',\'保留原业务内容\',now()) RETURNING id', [user])).rows[0].id;
  const tag = (await blog.query('INSERT INTO "Tag"(content,color,"userId","updatedAt") VALUES($1,\'#008080\',$2,now()) RETURNING id', [suffix, user])).rows[0].id;
  await blog.query('INSERT INTO "TagsOnBlogs"("blogId","tagId","assignedBy") VALUES($1,$2,$3)', [article, tag, user]);
  await blog.query('INSERT INTO "BlogLike"(id,"blogId","userId") VALUES($1,$2,$3)', [randomUUID(), article, user]);
  await blog.query('INSERT INTO "BlogFavorite"(id,"blogId","userId") VALUES($1,$2,$3)', [randomUUID(), article, user]);
  const todo = (await blog.query('INSERT INTO "Todo"(content,"userId","updateAt","finishedAt") VALUES(\'原任务\',$1,now(),now()) RETURNING id', [user])).rows[0].id;
  await blog.query('INSERT INTO "TagsOnTodos"("todoId","tagId","assignedBy") VALUES($1,$2,$3)', [todo, tag, user]);
  const checklist = randomUUID();
  await blog.query('INSERT INTO "Checklist"(id,"userId","createRequestId","createPayloadHash",name,"themeColor","expiresAt","updatedAt") VALUES($1,$2,$3,$4,\'原清单\',\'#20c997\',now()+interval \'30 days\',now())', [checklist, user, randomUUID(), "a".repeat(64)]);
  await blog.query('INSERT INTO "ChecklistItem"(id,"checklistId",detail,"createdOrder","updatedAt") VALUES($1,$2,\'原事项\',1,now())', [randomUUID(), checklist]);
  await blog.query('INSERT INTO "PomodoroRecord"(id,"userId",type,finished,"startAt","endAt","durationMs","actualDurationMs","updateAt") VALUES($1,$2,\'FOCUS\',true,now()-interval \'25 minutes\',now(),1500000,1500000,now())', [randomUUID(), user]);
  await center.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,\'中心昵称不覆盖博客\',$2,true,now(),now())', [subject, centerEmail]);
  await center.query('INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) SELECT $1,$2,\'credential\',$2,password,now(),now() FROM account WHERE user_id=$3 AND provider_id=\'credential\'', [randomUUID(), subject, fixture.fixtures.center.id]);
  return { user, email, centerEmail, subject, article };
}
async function businessSnapshot(user: string) {
  const result: Record<string, unknown> = {};
  for (const [table, key] of [["Blog", "authorId"], ["Tag", "userId"], ["BlogLike", "userId"], ["BlogFavorite", "userId"], ["Todo", "userId"], ["Checklist", "userId"], ["PomodoroRecord", "userId"], ["TagsOnBlogs", "assignedBy"], ["TagsOnTodos", "assignedBy"]]) {
    result[table] = (await blog.query(`SELECT to_jsonb(t) value FROM "${table}" t WHERE "${key}"=$1 ORDER BY to_jsonb(t)::text`, [user])).rows;
  }
  result.ChecklistItem = (await blog.query('SELECT to_jsonb(t) value FROM "ChecklistItem" t JOIN "Checklist" c ON c.id=t."checklistId" WHERE c."userId"=$1 ORDER BY t.id', [user])).rows;
  return result;
}
async function centerLogin(page: Page, email: string, password = fixture.fixtures.password) {
  await page.waitForURL(url => url.origin === "https://auth.zhaosie.com" && url.pathname === "/auth/sign-in");
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/auth/consent" || (url.origin === "https://blog.zhaosie.com" && !url.pathname.includes("callback")));
  if (new URL(page.url()).pathname === "/auth/consent") {
    await expect(page.getByText("授权给feline-blog", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "批准并继续" }).click();
  }
  await page.waitForURL(url => url.origin === "https://blog.zhaosie.com" && !url.pathname.includes("callback"));
}
for (const sameEmail of [false, true]) test(`0003 AC-1 AC-5 AC-7 AC-8 AC-9 AC-14 binds the original ROOT (${sameEmail ? "same email" : "different email"}) and forces fresh login after logout`, async ({ page, browser }, info) => {
  let callbackNavigations = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === "/api/auth/callback/user-center") callbackNavigations++;
  });
  const person = await account();
  if (sameEmail) { await center.query('UPDATE "user" SET email=$1 WHERE id=$2', [person.email, person.subject]); person.centerEmail = person.email; }
  const businessBefore = await businessSnapshot(person.user);
  const signedIn = await authPost(page.request, "login", { email: person.email, password: fixture.fixtures.password });
  expect(signedIn.status()).toBe(200);
  expect((await authPost(page.request, "user-center/bind/start", { password: "wrong original password" })).status()).toBe(401);
  const oldCookies = await page.context().cookies();
  const stale = await browser.newContext(); await stale.addCookies(oldCookies);
  try {
    const profile = await page.goto("/profile");
    // The canonical HTTPS fixture runs production builds. The localhost fixture
    // uses Next dev, which overrides page Cache-Control to no-cache.
    const cacheDirective = fixture.blogEnv.FELINE_PUBLIC_ORIGIN === "https://blog.zhaosie.com" ? "no-store" : "no-cache";
    expect(profile?.headers()["cache-control"]).toContain(cacheDirective); expect(profile?.headers()["referrer-policy"]).toBe("strict-origin");
    await page.getByLabel("原博客密码").fill(fixture.fixtures.password);
    await page.getByRole("button", { name: "验证旧密码并前往用户中心" }).click();
    await centerLogin(page, person.centerEmail);
    await expect(page.getByRole("heading", { name: "确认绑定用户中心" })).toBeVisible();
    const before = (await blog.query('SELECT id,email,username,role,avatar,work,password FROM users WHERE id=$1', [person.user])).rows[0];
    expect(before.password).not.toBeNull();
    await expect(page.getByRole("main").getByText(/原密码散列将被清除/)).toBeVisible();
    const confirmButton = page.getByRole("button", { name: "确认绑定并停用旧密码" });
    await expect(confirmButton).toBeEnabled();
    expect((await confirmButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await confirmButton.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `.feline-blog/${info.project.name}-binding-${sameEmail ? "same" : "different"}-confirm.png` });
    await page.getByRole("button", { name: "确认绑定并停用旧密码" }).click();
    await expect(page.getByText("此账号仅使用用户中心登录，原博客密码已停用。")).toBeVisible();
    const after = (await blog.query('SELECT id,email,username,role,avatar,work,password,"authMode","authVersion" FROM users WHERE id=$1', [person.user])).rows[0];
    expect(after).toMatchObject({ ...before, password: null, authMode: "center", authVersion: 1 });
    expect((await blog.query('SELECT "authorId" FROM "Blog" WHERE id=$1', [person.article])).rows[0].authorId).toBe(person.user);
    const businessAfter = await businessSnapshot(person.user);
    expect(businessAfter).toEqual(businessBefore);
    const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    await info.attach("preserved-business", { body: JSON.stringify({ relations: Object.keys(businessBefore).length, before: checksum(businessBefore), after: checksum(businessAfter), sameEmail }), contentType: "application/json" });
    expect((await stale.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(401);
    expect((await authPost(stale.request, "login", { email: person.email, password: fixture.fixtures.password })).status()).toBe(401);
    await page.goto(`/blog/${person.article}`); await expect(page.getByRole("heading", { name: "绑定验收文章", exact: true })).toBeVisible();
    await page.goto("/profile"); await page.getByRole("button", { name: "退出当前浏览器" }).click();
    await page.waitForURL(url => url.pathname === "/login");
    await page.getByRole("button", { name: "使用用户中心登录" }).click();
    await page.waitForURL(url => url.origin === "https://auth.zhaosie.com" && url.pathname === "/auth/sign-in");
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await centerLogin(page, person.centerEmail);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    expect(callbackNavigations).toBe(2);
  } finally { await stale.close(); }
});

test("0003 AC-4 AC-5 AC-9 AC-17 AC-18 stale pages cannot cancel a replacement; explicit create uses USER", async ({ page }, info) => {
  const person = await account();
  await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
  await centerLogin(page, person.centerEmail);
  await expect(page.getByRole("heading", { name: "选择你的博客账号" })).toBeVisible();
  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto("/login"); await otherTab.getByRole("button", { name: "使用用户中心登录" }).click();
    await expect(otherTab.getByRole("heading", { name: "选择你的博客账号" })).toBeVisible();
    await page.getByRole("button", { name: "取消本次流程" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "登录流程已在其他页面更新" })).toBeVisible();
    expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [person.subject])).rows[0].n).toBe(0);
    await expect(otherTab.getByRole("button", { name: "确认创建新账号" })).toBeEnabled();
    await otherTab.screenshot({ path: `.feline-blog/${info.project.name}-onboarding.png` });
    await otherTab.getByLabel("博客昵称").fill("明确创建的新博客用户");
    await otherTab.getByRole("button", { name: "确认创建新账号" }).click();
    await otherTab.waitForURL(url => url.pathname === "/");
    const me = await otherTab.request.get("/api/auth/me"); expect(me.status()).toBe(200);
    const user = (await me.json()).data.user;
    expect(user).toMatchObject({ role: "USER", username: "明确创建的新博客用户", authMode: "center", email: person.centerEmail });
    expect(user.id).not.toBe(person.user);
    expect((await blog.query('SELECT password FROM users WHERE id=$1', [user.id])).rows[0].password).toBeNull();
  } finally { await otherTab.close(); }
});

test("0003 AC-6 AC-9 an occupied email never claims or merges an old account", async ({ page }) => {
  const person = await account();
  await center.query('UPDATE "user" SET email=$1 WHERE id=$2', [person.email, person.subject]);
  await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
  await centerLogin(page, person.email);
  await page.getByRole("button", { name: "确认创建新账号" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "此邮箱暂不能建立新账号" })).toBeVisible();
  expect((await blog.query('SELECT "authMode",password IS NOT NULL AS has_password FROM users WHERE id=$1', [person.user])).rows[0]).toEqual({ authMode: "legacy", has_password: true });
  expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [person.subject])).rows[0].n).toBe(0);
  await page.getByRole("button", { name: "绑定已有账号" }).click();
  await page.waitForURL(url => url.pathname === "/login" && url.search === "");
});

test("0003 AC-12 AC-13 center password recovery revokes both browsers and a new login never revives old grants", async ({ page, browser }) => {
  const person = await account();
  await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
  await centerLogin(page, person.centerEmail);
  await page.getByRole("button", { name: "确认创建新账号" }).click();
  await page.waitForURL(url => url.pathname === "/");
  const oldId = (await (await page.request.get("/api/auth/me")).json()).data.user.id;
  const peer = await browser.newContext();
  try {
    const second = await peer.newPage();
    await second.goto("https://blog.zhaosie.com/login"); await second.getByRole("button", { name: "使用用户中心登录" }).click();
    await centerLogin(second, person.centerEmail);
    expect((await peer.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(200);
    expect((await blog.query("SELECT count(DISTINCT center_session_id)::int n, count(DISTINCT grant_encrypted)::int grants FROM feline_auth_session WHERE user_id=$1 AND revoked_at IS NULL", [oldId])).rows[0]).toEqual({ n: 2, grants: 2 });
    const old = await browser.newContext(); await old.addCookies(await page.context().cookies());
    try {
      const reset = await page.request.post("https://auth.zhaosie.com/api/v1/auth/otp/reset/request", { headers: { Origin: "https://auth.zhaosie.com" }, data: { email: person.centerEmail } });
      expect(reset.status()).toBe(202);
      let mailId = "";
      await expect.poll(async () => {
        const list = await (await page.request.get(`${mailpitOrigin}/api/v1/messages`)).json();
        mailId = list.messages?.find((mail: { To: { Address: string }[]; Subject: string; ID: string }) => mail.To.some(to => to.Address === person.centerEmail) && mail.Subject.includes("重置"))?.ID ?? "";
        return !!mailId;
      }).toBe(true);
      const mail = await (await page.request.get(`${mailpitOrigin}/api/v1/message/` + mailId)).json();
      const link = new URL(mail.Text.match(/https:\/\/auth.zhaosie.com\/auth\/reset-password\?[^\s]+/)[0]);
      expect([...link.searchParams.keys()]).toEqual(["app"]);
      const otp = mail.Text.match(/\b[0-9]{6}\b/)?.[0];
      expect(otp?.length).toBe(6);
      const newPassword = fixture.fixtures.password + "changed!";
      const changed = await page.request.post("https://auth.zhaosie.com/api/v1/auth/otp/reset/confirm", { headers: { Origin: "https://auth.zhaosie.com" }, data: { email: person.centerEmail, otp, newPassword, flowContext: { kind: "none" } } });
      expect(changed.status()).toBe(200);
      expect((await page.request.get("/api/auth/me")).status()).toBe(401);
      expect((await peer.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(401);
      await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
      await centerLogin(page, person.centerEmail, newPassword);
      expect((await (await page.request.get("/api/auth/me")).json()).data.user.id).toBe(oldId);
      expect((await old.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(401);
      expect((await peer.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(401);
    } finally { await old.close(); }
  } finally { await peer.close(); }
});
test("0003 AC-3 AC-4 AC-17 creates no local account before explicit onboarding and cancellation", async ({ page }) => {
  const person = await account();
  await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
  await centerLogin(page, person.centerEmail);
  await expect(page.getByRole("heading", { name: "选择你的博客账号" })).toBeVisible();
  expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [person.subject])).rows[0].n).toBe(0);
  await page.getByRole("button", { name: "取消本次流程" }).click();
  await page.waitForURL(url => url.pathname === "/login");
  expect((await blog.query("SELECT count(*)::int n FROM users WHERE email=$1", [person.centerEmail])).rows[0].n).toBe(0);
  const responses = await Promise.all(Array.from({ length: 3 }, () => authPost(page.request, "register", { email: person.centerEmail, password: fixture.fixtures.password })));
  expect(responses.map(r => r.status())).toEqual([409, 409, 409]);
});
test("0003 AC-16 rejects sibling origins and cross browser callbacks without creating sessions", async ({ page, browser }) => {
  const csrf = await page.request.get("/api/auth/csrf"); const value = await csrf.json();
  const rejected = await page.request.post("/api/auth/user-center/start", { headers: { Origin: "http://sibling.invalid" }, data: { csrfToken: value.data.csrfToken, intent: "login" } });
  expect(rejected.status()).toBe(403);
  const other = await browser.newContext();
  try {
    const response = await other.request.get("https://blog.zhaosie.com/api/auth/callback/user-center?code=fixture&state=fixture", { maxRedirects: 0 });
    expect(response.status()).toBe(405); expect((await other.request.get("https://blog.zhaosie.com/api/auth/me")).status()).toBe(401);
  } finally { await other.close(); }
});

test("0003 AC-15 center outage preserves public reading, blocks identity with 503, then retries the same session", async ({ page }, info) => {
  const person = await account();
  await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
  await centerLogin(page, person.centerEmail);
  await page.getByRole("button", { name: "确认创建新账号" }).click();
  await page.waitForURL(url => url.pathname === "/");
  const before = (await (await page.request.get("/api/auth/me")).json()).data.user.id;
  // Fault only this task's center database, never an existing service/container.
  if (new URL(fixture.centerEnv.DATABASE_URL).username !== "https_runtime") throw Error("OWNED_RUNTIME_ROLE_REQUIRED");
  await center.query('REVOKE SELECT ON oauth_access_token FROM https_runtime');
  try {
    expect((await page.request.get("/api/auth/me")).status()).toBe(503);
    await page.goto(`/blog/${person.article}`);
    await expect(page.getByRole("heading", { name: "绑定验收文章", exact: true })).toBeVisible();
    await expect(page.getByText("身份暂时不可用，你仍可阅读这篇公开文章。登录和互动请稍后重试。")).toBeVisible();
    await page.screenshot({ path: `.feline-blog/${info.project.name}-public-during-center-outage.png` });
  } finally { await center.query('GRANT SELECT ON oauth_access_token TO https_runtime'); }
  const recovered = await page.request.get("/api/auth/me"); expect(recovered.status()).toBe(200);
  expect((await recovered.json()).data.user.id).toBe(before);
  await blog.query('ALTER ROLE app_runtime NOLOGIN');
  try {
    await blog.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename='app_runtime' AND pid<>pg_backend_pid()");
    expect((await page.request.get("/api/auth/me")).status()).toBe(503);
    await page.goto(`/blog/${person.article}`);
    await expect(page.getByRole("heading", { name: "文章暂时不可用" })).toBeVisible();
    await expect(page.getByRole("link", { name: "重试", exact: true }).first()).toBeVisible();
  } finally { await blog.query('ALTER ROLE app_runtime LOGIN'); }
  await expect.poll(async () => (await page.request.get("/api/auth/me")).status()).toBe(200);
});

test("0003 AC-19 password limits are shared by browser contexts and return a retry delay", async ({ page, browser }) => {
  const person = await account();
  const statuses: number[] = [];
  for (let n = 0; n < 6; n++) statuses.push((await authPost(page.request, "login", { email: person.email, password: "deliberately wrong fixture password" })).status());
  expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  const peer = await browser.newContext({ baseURL: "https://blog.zhaosie.com" });
  try {
    const csrf = (await (await peer.request.get("/api/auth/csrf")).json()).data.csrfToken;
    const limited = await peer.request.post("/api/auth/login", { headers: { Origin: "https://blog.zhaosie.com" }, data: { email: person.email, password: "deliberately wrong fixture password", csrfToken: csrf } });
    expect(limited.status()).toBe(429); expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  } finally { await peer.close(); }
});

test("0003 AC-3 AC-4 AC-18 registers and verifies at the center, then explicitly creates the blog profile", async ({ page }) => {
  const email = `signup-${randomUUID()}@user-center.test`;
  await page.goto("/register"); await page.getByRole("button", { name: "前往用户中心注册" }).click();
  await page.waitForURL(url => url.origin === "https://auth.zhaosie.com" && url.pathname === "/auth/sign-in");
  await page.getByRole("link", { name: "注册账号", exact: true }).click();
  await page.getByLabel("称呼", { exact: true }).fill("邮件注册用户");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(fixture.fixtures.password);
  await page.getByLabel("确认密码", { exact: true }).fill(fixture.fixtures.password);
  await page.getByRole("button", { name: "注册账号", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/auth/verify-pending");
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  expect((await page.request.get("https://auth.zhaosie.com/api/v1/session")).status()).toBe(401);
  expect((await blog.query("SELECT count(*)::int n FROM users WHERE email=$1", [email])).rows[0].n).toBe(0);
  let mailId = "";
  await expect.poll(async () => {
    const list = await (await page.request.get(`${mailpitOrigin}/api/v1/messages`)).json();
    mailId = list.messages?.find((mail: { To: { Address: string }[]; Subject: string; ID: string }) => mail.To.some(to => to.Address === email) && mail.Subject.includes("验证"))?.ID ?? "";
    return !!mailId;
  }).toBe(true);
  const mail = await (await page.request.get(`${mailpitOrigin}/api/v1/message/` + mailId)).json();
  const link = new URL(mail.Text.match(/https:\/\/auth.zhaosie.com\/auth\/verify-email\?[^\s]+/)[0]);
  expect([...link.searchParams.keys()]).toEqual(["app"]);
  expect(link.searchParams.get("app")).toBe("feline-blog");
  const otp = mail.Text.match(/\b[0-9]{6}\b/)?.[0];
  expect(otp?.length).toBe(6);
  await page.goto(link.href);
  expect((await page.request.get("https://auth.zhaosie.com/api/v1/session")).status()).toBe(401);
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("六位验证码", { exact: true }).fill(otp!);
  await page.getByRole("button", { name: "验证并继续" }).click();
  await page.waitForURL(url => url.pathname === "/auth/consent");
  await page.getByRole("button", { name: "批准并继续" }).click();
  await expect(page.getByRole("heading", { name: "选择你的博客账号" })).toBeVisible();
  expect((await blog.query("SELECT count(*)::int n FROM users WHERE email=$1", [email])).rows[0].n).toBe(0);
  await page.getByRole("button", { name: "确认创建新账号" }).click();
  await page.waitForURL(url => url.origin === "https://blog.zhaosie.com" && url.pathname === "/profile");
  expect((await (await page.request.get("/api/auth/me")).json()).data.user).toMatchObject({ email, role: "USER", username: "邮件注册用户", authMode: "center" });
});

test("0003 AC-13 AC-17 refuses final onboarding when its center session was revoked", async ({ page }) => {
  const person = await account();
  await page.goto("/login"); await page.getByRole("button", { name: "使用用户中心登录" }).click();
  await centerLogin(page, person.centerEmail);
  await expect(page.getByRole("heading", { name: "选择你的博客账号" })).toBeVisible();
  await center.query('DELETE FROM session WHERE user_id=$1', [person.subject]);
  await page.getByRole("button", { name: "确认创建新账号" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "本次认证未完成" })).toBeVisible();
  expect((await blog.query("SELECT count(*)::int n FROM users WHERE email=$1", [person.centerEmail])).rows[0].n).toBe(0);
  expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [person.subject])).rows[0].n).toBe(0);
});

async function authorizationCode(request: APIRequestContext, email: string) {
  const centerOrigin = "https://auth.zhaosie.com";
  const started = await authPost(request, "user-center/start", { intent: "login" }); expect(started.status()).toBe(200);
  const initial = (await started.json()).data.navigation;
  expect(initial.kind).toBe("post");
  let response = await request.post(initial.action, { form: initial.fields, headers: { Origin: "https://blog.zhaosie.com", Accept: "application/json" }, maxRedirects: 0 });
  expect(response.status()).toBe(200);
  let navigation = (await response.json()).navigation;
  if (navigation.kind === "page" && navigation.path === "/auth/sign-in") {
    const flowContext = await capturedCenterFlow(request);
    response = await request.post(centerOrigin + "/api/auth/sign-in/email", { headers: { Origin: centerOrigin, Accept: "application/json" }, data: { email, password: fixture.fixtures.password, flowContext } });
    expect(response.status()).toBe(200); navigation = (await response.json()).navigation;
  }
  if (navigation.kind === "page" && navigation.path === "/auth/consent") {
    const flowContext = await capturedCenterFlow(request);
    response = await request.post(centerOrigin + "/api/auth/oauth2/consent", { headers: { Origin: centerOrigin, Accept: "application/json" }, data: { accept: true, flowContext } });
    expect(response.status()).toBe(200); navigation = (await response.json()).navigation;
  }
  expect(navigation.kind).toBe("post"); expect(navigation.action).toBe("https://blog.zhaosie.com/api/auth/callback/user-center");
  expect(Object.keys(navigation.fields).sort()).toEqual(["code", "iss", "state"]);
  return navigation;
}

test("0003 AC-10 real provider refuses the wrong PKCE verifier", async ({ page, browser }) => {
  const person = await account(); const callback = await authorizationCode(page.request, person.centerEmail);
  const client = await browser.newContext();
  try {
    const encoded = (value: string) => encodeURIComponent(value).replaceAll("%20", "+");
    const basic = Buffer.from(encoded("feline-blog") + ":" + encoded(fixture.blogEnv.USER_CENTER_CLIENT_SECRET)).toString("base64");
    const response = await client.request.post("https://auth.zhaosie.com/api/auth/oauth2/token", { headers: { Authorization: "Basic " + basic }, form: { grant_type: "authorization_code", code: callback.fields.code, redirect_uri: "https://blog.zhaosie.com/api/auth/callback/user-center", code_verifier: "wrong-verifier-".repeat(4) } });
    expect(response.status()).toBe(401); expect((await response.json()).error).toBe("invalid_request");
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
    expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [person.subject])).rows[0].n).toBe(0);
  } finally { await client.close(); }
});

test("0003 AC-10 AC-18 genuine POST callback rejects wrong state, wrong issuer, invalid code and replay", async ({ page }) => {
  const person = await account();
  const callback = await authorizationCode(page.request, person.centerEmail);
  const submit = (navigation: typeof callback) => page.request.post(navigation.action, { form: navigation.fields, maxRedirects: 0, headers: { Origin: "https://auth.zhaosie.com", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" } });
  const denied = await submit({ ...callback, fields: { ...callback.fields, state: "wrong-state" } });
  expect(denied.status()).toBe(409); expect((await denied.json()).code).toBe("INVALID_STATE");
  const pending = await submit(callback);
  expect(new URL(pending.headers().location).pathname).toBe("/auth/user-center/onboarding");
  const replay = await submit(callback); expect(replay.status()).toBe(409); expect(replay.headers().location).toBeUndefined();
  for (const mutation of ["issuer", "code"]) {
    const next = await authorizationCode(page.request, person.centerEmail);
    next.fields[mutation === "issuer" ? "iss" : "code"] = mutation === "issuer" ? "https://wrong.invalid/api/auth" : "invalid-one-use-code";
    const response = await submit(next); expect(response.status()).toBeGreaterThanOrEqual(400); expect(response.headers().location).toBeUndefined();
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  }
  expect((await blog.query("SELECT count(*)::int n FROM feline_auth_identity WHERE subject=$1", [person.subject])).rows[0].n).toBe(0);
});
