import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateToken } from "@/lib/jwt";
import { parseString } from "@/lib/server/validation";
import { validateEmail } from "@/utils/auth";
import { actionResponse } from "@/lib/response/ApiResponse";
import { AuthError, centerConfig, destination } from "./config";
import { randomToken, sign } from "./crypto";
import { callback, csrfToken, passwordProof, startFlow, submitFlow, trustedIp, verifyCsrf } from "./flows";
import { resolveIdentity } from "./session";
import { browserState, cookieNames, query, rateLimit, type CookieReader } from "./store";
import { ensureAuthReady } from "./readiness";

export const authMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱或密码不正确，请使用旧账号密码或用户中心登录。",
  FLOW_REPLACED: "登录流程已在其他页面更新，请使用最新页面重新操作。",
  FLOW_EXPIRED: "本次操作已过期，原账号保持不变，请重新开始。",
  FLOW_PROCESSED: "本次操作已处理，请重新登录。",
  EMAIL_UNAVAILABLE: "此邮箱暂不能建立新账号，请验证已有账号或取消。",
  IDENTITY_ALREADY_LINKED: "身份已建立，请重新登录。",
  VERIFIED_EMAIL_REQUIRED: "请先在用户中心验证邮箱，再重新开始。",
  FRESH_AUTH_REQUIRED: "需要重新输入用户中心密码，请重新开始登录。",
  USERNAME_REQUIRED: "请填写 1 至 50 个字符的昵称。",
  RATE_LIMITED: "尝试过于频繁，请按提示稍后再试。",
  CSRF_REJECTED: "页面已更新，请刷新后重新操作。",
  ENTRY_UNAVAILABLE: "此入口暂未开放，请稍后重试。",
};
export function requestCookies(headers: Headers): CookieReader {
  const values = new Map<string, string>();
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (values.has(name)) throw new AuthError("INVALID_COOKIE", 400);
    values.set(name, part.slice(i + 1).trim());
  }
  return name => values.get(name);
}
export function sameOrigin(headers: Headers, mutation: boolean) {
  const origin = headers.get("origin");
  if ((mutation && origin !== centerConfig().origin) || (origin !== null && origin !== centerConfig().origin) || headers.get("sec-fetch-site") === "cross-site") throw new AuthError("ORIGIN_REJECTED", 403);
}
async function body(request: Request, keys: string[]) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("INVALID_INPUT", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const value = await reader.read();
    if (value.done) break;
    size += value.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new AuthError("INPUT_TOO_LARGE", 413); }
    chunks.push(value.value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let parsed: Record<string, unknown>;
  try {
    if (request.headers.get("content-type")?.startsWith("application/json")) parsed = JSON.parse(raw);
    else if (request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(raw);
      for (const key of form.keys()) if (form.getAll(key).length !== 1) throw new Error();
      parsed = Object.fromEntries(form);
    } else throw new Error();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).some(key => ![...keys, "csrfToken"].includes(key))) throw new Error();
    return parsed;
  } catch { throw new AuthError("INVALID_INPUT", 400); }
}
const options = () => ({ path: "/", httpOnly: true, secure: centerConfig().production, sameSite: "lax" as const });
function clear(response: NextResponse, name: string) { response.cookies.set(name, "", { ...options(), maxAge: 0 }); }
function success(request: Request, value: { location: string; token?: string; expires?: Date }, read: CookieReader) {
  const response = request.headers.get("accept")?.includes("application/json") ? actionResponse.success({ location: value.location }) : NextResponse.redirect(new URL(value.location, centerConfig().origin), 303);
  const names = cookieNames();
  clear(response, names.flow);
  if (value.token) {
    response.cookies.set(names.session, value.token, { ...options(), expires: value.expires });
    clear(response, "token"); clear(response, names.fresh);
    response.cookies.set(names.csrf, randomToken(), { ...options(), maxAge: 1800 });
  }
  const browser = read(names.browser);
  if (browser) response.cookies.set(names.browser, browser, { ...options(), maxAge: 604800 });
  return response;
}
type Operation = "csrf" | "login" | "register" | "logout" | "start" | "bind-start" | "callback" | "onboarding" | "confirm" | "cancel";
export async function authHttp(request: Request, operation: Operation) {
  const requestId = randomUUID();
  let response: NextResponse;
  try { response = await dispatch(request, operation); }
  catch (error) {
    const e = error instanceof AuthError ? error : new AuthError("AUTH_UNAVAILABLE", 503);
    const message = authMessages[e.code] ?? (e.status === 503 ? "认证服务暂时不可用，请稍后重试。" : "本次认证未完成，请从登录页重新开始。");
    response = NextResponse.json({ error: true, message, code: e.code, data: null, requestId }, { status: e.status });
    if (e.retryAfter) response.headers.set("Retry-After", String(e.retryAfter));
    // Deliberately fixed metadata only, never the exception, URL or request body.
    console.info(JSON.stringify({ event: "feline_auth", operation, code: e.code, status: e.status, requestId }));
    if (operation === "callback") {
      const location = new URL("/auth/user-center/error", process.env.FELINE_PUBLIC_ORIGIN ?? "http://localhost:3000");
      location.searchParams.set("code", e.code); location.searchParams.set("requestId", requestId);
      response = NextResponse.redirect(location, 303);
    }
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Request-Id", requestId);
  return response;
}
async function dispatch(request: Request, operation: Operation): Promise<NextResponse> {
  const read = requestCookies(request.headers), names = cookieNames();
  const config = centerConfig();
  if (operation === "callback") {
    if (request.method !== "GET") throw new AuthError("METHOD_NOT_ALLOWED", 405);
    const result = await callback(read, new URL(request.url));
    // Pending pages still need their one time flow cookie.
    if (!("token" in result)) return NextResponse.redirect(new URL(result.location, config.origin), 303);
    return success(request, result, read);
  }
  sameOrigin(request.headers, request.method !== "GET");
  if (operation === "csrf") {
    if (request.method !== "GET") throw new AuthError("METHOD_NOT_ALLOWED", 405);
    await rateLimit("entry", trustedIp(request.headers), 60, 20);
    const { browser, token } = await browserState(read, true);
    const nonce = randomToken();
    const response = actionResponse.success({ csrfToken: csrfToken(browser, nonce) });
    if (token) response.cookies.set(names.browser, token, { ...options(), maxAge: 604800 });
    response.cookies.set(names.csrf, nonce, { ...options(), maxAge: 1800 });
    return response;
  }
  if (request.method !== "POST") throw new AuthError("METHOD_NOT_ALLOWED", 405);
  if (operation === "register") return actionResponse.error("新用户请从用户中心注册，原本地注册入口已关闭。", 409);
  const fields = { login: ["email", "password"], logout: [], start: ["intent", "destination"], "bind-start": ["password"], onboarding: ["flowProof", "choice", "confirm", "username"], confirm: ["flowProof", "confirm"], cancel: ["flowProof"] }[operation];
  const input = await body(request, fields);
  const browser = await verifyCsrf(read, input.csrfToken);
  if (!["login", "bind-start"].includes(operation)) await rateLimit("entry", trustedIp(request.headers), 60, 20);
  if (operation === "logout") {
    const [result] = await query<{ epoch: number }>("SELECT public.logout_browser($1,$2) AS epoch", [browser.id, browser.epoch]);
    const response = actionResponse.success(null, "退出成功");
    for (const name of ["token", names.session, names.flow]) clear(response, name);
    response.cookies.set(names.csrf, randomToken(), { ...options(), maxAge: 1800 });
    response.cookies.set(names.fresh, sign("reauth", { browser: browser.id, epoch: result.epoch, at: Date.now(), nonce: randomToken() }), { ...options(), maxAge: 604800 });
    response.cookies.set(names.browser, read(names.browser)!, { ...options(), maxAge: 604800 });
    return response;
  }
  if (operation === "login") {
    // Dependency outages cannot be converted into an explicit legacy login.
    if (read(names.session)) await resolveIdentity(read);
    const email = parseString(input.email, { label: "邮箱", max: 254 })?.toLowerCase();
    const password = parseString(input.password, { label: "密码", max: 128, trim: false });
    if (!email || !password || !validateEmail(email)) throw new AuthError("INVALID_INPUT", 400);
    const user = await passwordProof(email, password, request.headers);
    await query("SELECT public.commit_legacy_login($1,$2,$3,$4)", [browser.id, browser.epoch, user.id, user.authVersion]);
    const { id, username, role, avatar } = user;
    const response = actionResponse.success({ user: { id, email, username, role, avatar, authMode: "legacy" } }, "登录成功");
    response.cookies.set("token", generateToken({ userId: id, email, role, authVersion: user.authVersion }), { ...options(), maxAge: 604800 });
    for (const name of [names.session, names.flow, names.csrf]) clear(response, name);
    return response;
  }
  if (operation === "start" || operation === "bind-start") {
    await ensureAuthReady();
    const user = await resolveIdentity(read);
    if (operation === "start" && user) return actionResponse.success({ location: "/profile" });
    let legacy;
    if (operation === "bind-start") {
      if (!user || user.authMode !== "legacy") throw new AuthError("LEGACY_PROOF_REQUIRED");
      const password = parseString(input.password, { label: "密码", max: 128, trim: false });
      if (!password) throw new AuthError("INVALID_INPUT", 400);
      legacy = await passwordProof(user.email, password, request.headers);
    } else if (!["login", "register"].includes(String(input.intent))) throw new AuthError("INVALID_INPUT", 400);
    if (operation === "start" && input.intent === "register" && config.registration !== "center") throw new AuthError("ENTRY_UNAVAILABLE", 503);
    const to = operation === "bind-start" ? "/profile" : destination(input.destination ?? "home");
    if (!to) throw new AuthError("INVALID_INPUT", 400);
    const result = await startFlow(read, browser, operation === "bind-start" ? "bind" : "login", to, legacy);
    const response = request.headers.get("accept")?.includes("application/json") ? actionResponse.success({ location: result.url }) : NextResponse.redirect(result.url, 303);
    response.cookies.set(names.flow, result.flow.id, { ...options(), expires: result.flow.expires_at });
    response.cookies.set(names.browser, read(names.browser)!, { ...options(), maxAge: 604800 });
    return response;
  }
  const result = await submitFlow(read, input.flowProof, operation === "confirm" ? "bind" : operation, input.choice, input.username, input.confirm);
  return success(request, result, read);
}
