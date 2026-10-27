import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { authPost, capturedCenterFlow } from "./auth-helpers";
import { digest, flowAAD, seal, sign, unseal } from "../src/lib/auth/center/crypto";

const fixture = JSON.parse(readFileSync(process.env.FELINE_AUTH_FIXTURE_FILE!, "utf8"));
if (fixture.owner !== "oauth-post-20261019" || fixture.blogEnv.FELINE_PUBLIC_ORIGIN !== "https://blog.zhaosie.com" || new URL(fixture.blogAdmin).port !== "54346" || new URL(fixture.centerAdmin).port !== "54346") throw Error("OWNED_HTTPS_FIXTURE_REQUIRED");
const centerOrigin = "https://auth.zhaosie.com", blogOrigin = "https://blog.zhaosie.com";
let center: Pool, blog: Pool;
test.beforeAll(() => { center = new Pool({ connectionString: fixture.centerAdmin, max: 1 }); blog = new Pool({ connectionString: fixture.blogAdmin, max: 1 }); });
test.afterAll(async () => { await center.end(); await blog.end(); });
test.beforeEach(async () => { await center.query("DELETE FROM rate_limit"); await blog.query("DELETE FROM feline_auth_rate"); });
async function account() {
  const id = randomUUID(), email = `oauth-${id}@user-center.test`;
  await center.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)', [id, "表单传输测试", email]);
  await center.query("INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) SELECT $1,$2,'credential',$2,password,now() FROM account WHERE user_id=$3 AND provider_id='credential'", [randomUUID(), id, fixture.fixtures.center.id]);
  return { id, email };
}
async function start(page: Page) {
  await page.goto(blogOrigin + "/login");
  const authorized = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/oauth2/authorize");
  await page.getByRole("button", { name: "使用用户中心登录", exact: true }).click();
  expect((await authorized).status()).toBe(303);
  await page.waitForURL(centerOrigin + "/auth/sign-in");
}
async function password(page: Page, email: string) {
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(fixture.fixtures.password);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-in/email");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  expect((await response).status()).toBe(200);
  await page.waitForURL(centerOrigin + "/auth/consent");
}
function audit(page: Page) {
  const urls: string[] = [], locations: string[] = [], posts: { path: string; origin?: string; method: string }[] = [];
  page.on("request", request => { urls.push(request.url()); const url = new URL(request.url()); if (["/api/auth/oauth2/authorize", "/api/auth/callback/user-center"].includes(url.pathname)) posts.push({ path: url.pathname, origin: request.headers().origin, method: request.method() }); });
  page.on("response", response => { const location = response.headers().location; if (location) locations.push(new URL(location, response.url()).href); });
  return () => {
    for (const raw of [...urls, ...locations]) { const url = new URL(raw); for (const key of ["state", "nonce", "code", "code_challenge", "code_verifier", "oauth_query", "sig", "access_token", "id_token", "resume_signature"]) expect(url.searchParams.has(key), "normal request URL must exclude " + key).toBe(false); if (url.pathname.startsWith("/auth/") || ["/login", "/register", "/profile"].includes(url.pathname)) for (const key of url.searchParams.keys()) expect(key, "fixed authentication page query is explicitly enumerated").toBe("app"); }
    for (const request of posts) { expect(request.method).toBe("POST"); expect(request.origin).toBe(request.path.includes("/callback/") ? centerOrigin : blogOrigin); }
    expect(posts.some(post => post.path.includes("authorize"))).toBe(true);
    return { requests: urls.length, locations: locations.length, protocolPosts: posts.length };
  };
}
test("AC-P2 AC-P5 AC-P6 trusted HTTPS login, consent and explicit profile creation", async ({ page }, info) => {
  const person = await account(), finishAudit = audit(page);
  await start(page);
  expect((await page.request.get(centerOrigin + "/auth/sign-in")).headers()["referrer-policy"]).toBe("strict-origin");
  await password(page, person.email);
  await page.getByRole("button", { name: "批准并继续", exact: true }).click();
  await page.waitForURL(blogOrigin + "/auth/user-center/onboarding");
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
  await page.getByRole("button", { name: "确认创建新账号", exact: true }).click();
  await page.waitForURL(blogOrigin + "/");
  await page.goto(blogOrigin + "/profile");
  await expect(page.getByText("此账号仅使用用户中心登录，原博客密码已停用。")).toBeVisible();
  const cookies = await page.context().cookies();
  for (const cookie of cookies.filter(cookie => cookie.name.includes("session") || cookie.name.includes("oauth-flow"))) { expect(cookie.secure).toBe(true); expect(cookie.sameSite).toBe("Lax"); expect(cookie.domain.startsWith(".")).toBe(false); }
  await info.attach("safe-request-audit", { body: JSON.stringify(finishAudit()), contentType: "application/json" });
  await page.screenshot({ path: `.feline-blog/${info.project.name}-oauth-post-profile.png` });
});
test("AC-P2 AC-P7 denial returns a uniform query free error page and creates no identity", async ({ page }) => {
  const person = await account(), finishAudit = audit(page);
  await start(page); await password(page, person.email);
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await page.waitForURL(blogOrigin + "/auth/user-center/error");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("登录或授权未完成，请从应用重新开始");
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
  finishAudit();
});
test("AC-P4 AC-P9 signup OTP uses the captured page and protected POST continue", async ({ page }, info) => {
  const email = `otp-post-${randomUUID()}@user-center.test`, finishAudit = audit(page);
  await start(page);
  await page.getByRole("link", { name: "注册账号", exact: true }).click();
  await page.waitForURL(centerOrigin + "/auth/sign-up");
  await page.getByLabel(/称呼|姓名|名称/).first().fill("验证码表单测试");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(fixture.fixtures.password);
  await page.getByLabel("确认密码", { exact: true }).fill(fixture.fixtures.password);
  await page.getByRole("button", { name: "注册账号", exact: true }).click();
  await page.waitForURL(centerOrigin + "/auth/verify-pending");
  let otp = "";
  await expect.poll(async () => {
    const listed = await (await page.request.get(fixture.mailpitOrigin + "/api/v1/messages")).json();
    const message = listed.messages.find((item: { ID: string; To: { Address: string }[] }) => item.To.some(to => to.Address === email));
    if (!message) return false;
    const mail = await (await page.request.get(fixture.mailpitOrigin + "/api/v1/message/" + message.ID)).json();
    otp = mail.Text.match(/验证码：([0-9]{6})/)?.[1] ?? "";
    return otp.length === 6;
  }).toBe(true);
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("六位验证码", { exact: true }).fill(otp);
  await page.getByRole("button", { name: "验证并继续", exact: true }).click();
  await page.waitForURL(centerOrigin + "/auth/consent");
  await page.getByRole("button", { name: "批准并继续", exact: true }).click();
  await page.waitForURL(blogOrigin + "/auth/user-center/onboarding");
  finishAudit();
  await page.screenshot({ path: `.feline-blog/${info.project.name}-oauth-post-otp.png` });
});

for (const surface of ["page", "submit"]) test(`AC-P8 terminates a pre-switch pending candidate at ${surface}`, async ({ page }) => {
  const person = await account();
  await start(page); await password(page, person.email);
  await page.getByRole("button", { name: "批准并继续", exact: true }).click();
  await page.waitForURL(blogOrigin + "/auth/user-center/onboarding");
  const row = (await blog.query("SELECT * FROM feline_auth_flow WHERE candidate_encrypted IS NOT NULL AND candidate_digest IS NOT NULL ORDER BY created_at DESC LIMIT 1")).rows[0];
  const candidate = unseal<Record<string, unknown>>(row.candidate_encrypted, flowAAD(row.id, "candidate"));
  expect(candidate.sub).toBe(person.id);
  delete candidate.transport;
  // Insert a pre-switch row rather than weakening the candidate-immutability trigger.
  const oldId = randomUUID(), encrypted = seal(candidate, flowAAD(oldId, "candidate"));
  await blog.query("INSERT INTO feline_auth_flow SELECT (jsonb_populate_record(NULL::feline_auth_flow,to_jsonb(f)||$2::jsonb)).* FROM feline_auth_flow f WHERE id=$1", [row.id, JSON.stringify({ id: oldId, candidate_encrypted: encrypted, state_hash: digest(randomUUID()) })]);
  await blog.query("UPDATE feline_auth_browser SET current_flow_id=$2 WHERE id=$1", [row.browser_state_id, oldId]);
  const flowCookie = (await page.context().cookies()).find(cookie => cookie.domain === "blog.zhaosie.com" && cookie.name.endsWith("-flow"))!;
  await page.context().addCookies([{ ...flowCookie, value: oldId }]);
  if (surface === "page") {
    await page.goto(blogOrigin + "/auth/user-center/onboarding");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  } else {
    const proof = sign("flowProof", { action: "onboarding", flow: oldId, browser: row.browser_state_id, epoch: row.browser_epoch, revision: row.confirmation_revision, digest: row.candidate_digest, user: row.legacy_user_id, version: row.legacy_auth_version, expires: row.expires_at.getTime() });
    const result = await authPost(page.request, "user-center/onboarding", { flowProof: proof, choice: "create", confirm: true });
    expect(result.status()).toBe(409);
  }
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
  expect((await blog.query("SELECT status,protocol_encrypted,candidate_encrypted,expires_at FROM feline_auth_flow WHERE id=$1", [oldId])).rows[0]).toEqual({ status: "failed", protocol_encrypted: null, candidate_encrypted: null, expires_at: row.expires_at });
});

test("AC-P8 rejects a pre-switch protocol and never extends its absolute deadline", async ({ page }) => {
  const person = await account();
  await page.goto(blogOrigin + "/login");
  const started = await authPost(page.request, "user-center/start", { intent: "login" });
  expect(started.status()).toBe(200);
  const navigation = (await started.json()).data.navigation;
  const row = (await blog.query("SELECT id,protocol_encrypted,expires_at FROM feline_auth_flow WHERE state_hash=$1", [digest(navigation.fields.state)])).rows[0];
  const protocol = unseal<Record<string, unknown>>(row.protocol_encrypted, flowAAD(row.id, "protocol")); delete protocol.transport;
  await blog.query("UPDATE feline_auth_flow SET protocol_encrypted=$2 WHERE id=$1", [row.id, seal(protocol, flowAAD(row.id, "protocol"))]);
  await page.evaluate(({ action, fields }) => { const form = document.createElement("form"); form.method = "post"; form.action = action; for (const [name, value] of Object.entries(fields)) { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value); form.append(input); } document.body.append(form); form.submit(); }, navigation);
  await page.waitForURL(centerOrigin + "/auth/sign-in"); await password(page, person.email);
  const result = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/callback/user-center");
  await page.getByRole("button", { name: "批准并继续", exact: true }).click();
  expect((await result).status()).toBe(409);
  expect((await blog.query("SELECT status,protocol_encrypted,candidate_encrypted,expires_at FROM feline_auth_flow WHERE id=$1", [row.id])).rows[0]).toEqual({ status: "failed", protocol_encrypted: null, candidate_encrypted: null, expires_at: row.expires_at });
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
});

test("AC-P2 center home entries use fixed document URLs", async ({ page }) => {
  const urls: string[] = []; page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/auth/")) urls.push(request.url()); });
  for (const [name, path] of [["登录", "/auth/sign-in"], ["注册账号", "/auth/sign-up"], ["找回密码", "/auth/forgot-password"]]) {
    await page.goto(centerOrigin + "/"); await page.getByRole("link", { name, exact: true }).click(); await page.waitForURL(centerOrigin + path);
  }
  for (const url of urls) expect(new URL(url).search).toBe("");
});

test("AC-P8 choosing an existing account returns to the fixed login page", async ({ page }) => {
  const person = await account(); await start(page); await password(page, person.email);
  await page.getByRole("button", { name: "批准并继续", exact: true }).click(); await page.waitForURL(blogOrigin + "/auth/user-center/onboarding");
  await page.getByRole("button", { name: "绑定已有账号", exact: true }).click(); await page.waitForURL(blogOrigin + "/login");
  expect(new URL(page.url()).search).toBe(""); await expect(page.getByText("旧账号登录", { exact: true })).toBeVisible();
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
});

test("AC-P4 old tab proof fails before password writes and leaves the replacement usable", async ({ page, context }) => {
  const person = await account(); await start(page);
  const other = await context.newPage(); await start(other);
  const original = await capturedCenterFlow(other.request);
  await page.getByLabel("邮箱", { exact: true }).fill(person.email); await page.getByLabel("密码", { exact: true }).fill(fixture.fixtures.password);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-in/email");
  await page.getByRole("button", { name: "登录", exact: true }).click(); expect((await response).status()).toBe(409);
  expect((await center.query("SELECT id FROM session WHERE user_id=$1", [person.id])).rowCount).toBe(0);
  expect(await capturedCenterFlow(other.request)).toEqual(original);
  await password(other, person.email); await other.getByRole("button", { name: "批准并继续", exact: true }).click(); await other.waitForURL(blogOrigin + "/auth/user-center/onboarding");
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0); await other.close();
});

for (const direction of ["overwrite", "clear"]) test(`AC-P4 reordered ${direction} cookie interrupts but cannot consume the replacement blog flow`, async ({ page, context }) => {
  const person = await account(); await page.goto(blogOrigin + "/login");
  async function begin(requireConsent = false) {
    const response = await authPost(page.request, "user-center/start", { intent: "login" }); expect(response.status()).toBe(200);
    const navigation = (await response.json()).data.navigation;
    if (requireConsent) navigation.fields.prompt = "consent";
    const authorized = await page.request.post(navigation.action, { form: navigation.fields, headers: { Origin: blogOrigin, Accept: "application/json" }, maxRedirects: 0 }); expect(authorized.status()).toBe(200);
    return { navigation, proof: await capturedCenterFlow(page.request) };
  }
  const a = await begin();
  const login = await page.request.post(centerOrigin + "/api/auth/sign-in/email", { headers: { Origin: centerOrigin }, data: { email: person.email, password: fixture.fixtures.password, flowContext: a.proof } }); expect(login.status()).toBe(200);
  const proofA = await capturedCenterFlow(page.request), cookieA = (await context.cookies()).find(cookie => cookie.name.endsWith(".oauth-flow"))!;
  let callback: { action: string; fields: Record<string, string> } | undefined;
  if (direction === "clear") { const result = await page.request.post(centerOrigin + "/api/auth/oauth2/consent", { headers: { Origin: centerOrigin }, data: { accept: true, flowContext: proofA } }); expect(result.status()).toBe(200); callback = (await result.json()).navigation; expect(result.headersArray().some(header => header.name.toLowerCase() === "set-cookie" && header.value.includes(".oauth-flow=;") && header.value.includes("Max-Age=0"))).toBe(true); }
  const b = await begin(true), before = (await blog.query("SELECT id,browser_state_id,expires_at,status FROM feline_auth_flow WHERE state_hash=$1", [digest(b.navigation.fields.state)])).rows[0];
  // Deliver the captured A response cookie after B's newer response, in both directions.
  await context.addCookies([{ ...cookieA, ...(direction === "clear" ? { value: "", expires: 1 } : {}) }]);
  const replaced = await page.request.post(centerOrigin + "/auth/continue", { headers: { Origin: centerOrigin }, data: { flowContext: b.proof }, maxRedirects: 0 }); expect(replaced.status()).toBe(409);
  if (direction === "overwrite") { const result = await page.request.post(centerOrigin + "/api/auth/oauth2/consent", { headers: { Origin: centerOrigin }, data: { accept: true, flowContext: proofA } }); expect(result.status()).toBe(200); callback = (await result.json()).navigation; }
  const denied = await page.request.post(callback!.action, { form: callback!.fields, headers: { Origin: centerOrigin, "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" }, maxRedirects: 0 }); expect(denied.status()).toBe(409);
  expect((await blog.query("SELECT status,expires_at FROM feline_auth_flow WHERE id=$1", [before.id])).rows[0]).toEqual({ status: before.status, expires_at: before.expires_at });
  expect((await blog.query("SELECT current_flow_id FROM feline_auth_browser WHERE id=$1", [before.browser_state_id])).rows[0].current_flow_id).toBe(before.id);
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
});

test("AC-P5 AC-P6 callback rejects origins and bounded input before a single concurrent exchange", async ({ page, browser }) => {
  const person = await account(); await start(page); await password(page, person.email);
  let fields: Record<string, string> | undefined;
  await page.route(blogOrigin + "/api/auth/callback/user-center", async route => { fields = Object.fromEntries(new URLSearchParams(route.request().postData()!)); await route.abort(); });
  await page.getByRole("button", { name: "批准并继续", exact: true }).click(); await expect.poll(() => !!fields).toBe(true);
  const endpoint = blogOrigin + "/api/auth/callback/user-center", headers = { Origin: centerOrigin, "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" };
  const flow = (await blog.query("SELECT id,status FROM feline_auth_flow WHERE state_hash=$1", [digest(fields!.state)])).rows[0];
  for (const origin of [undefined, "null", blogOrigin, centerOrigin + "/", "https://sibling.zhaosie.com", "https://candidate.vercel.app"]) {
    const response = await page.request.post(endpoint, { form: fields!, headers: { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document", ...(origin ? { Origin: origin } : {}) }, maxRedirects: 0 }); expect(response.status()).toBe(403); expect(response.headers().location).toBeUndefined();
  }
  for (const suffix of ["&state=duplicate", "&unknown=unexpected", "&error=access_denied"]) expect((await page.request.post(endpoint, { data: new URLSearchParams(fields!).toString() + suffix, headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0 })).status()).toBe(400);
  expect((await page.request.post(endpoint, { data: "code=" + "x".repeat(8193), headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0 })).status()).toBe(413);
  expect((await page.request.post(endpoint + "?state=not-allowed", { form: fields!, headers, maxRedirects: 0 })).status()).toBe(400);
  expect((await page.request.post(endpoint, { data: fields!, headers, maxRedirects: 0 })).status()).toBe(400);
  const other = await browser.newContext();
  try { const response = await other.request.post(endpoint, { form: fields!, headers, maxRedirects: 0 }); expect(response.status()).toBe(401); expect(response.headers().location).toBeUndefined(); } finally { await other.close(); }
  expect((await blog.query("SELECT status FROM feline_auth_flow WHERE id=$1", [flow.id])).rows[0].status).toBe("created");
  const result = await Promise.all([1, 2].map(() => page.request.post(endpoint, { form: fields!, headers, maxRedirects: 0 })));
  expect(result.map(response => response.status()).sort()).toEqual([303, 409]);
  expect((await blog.query("SELECT status FROM feline_auth_flow WHERE id=$1", [flow.id])).rows[0].status).toBe("pending_choice");
  expect((await blog.query("SELECT id FROM feline_auth_identity WHERE subject=$1", [person.id])).rowCount).toBe(0);
});
