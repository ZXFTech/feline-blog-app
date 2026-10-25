import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError, centerConfig } from "./config";

export const oauthErrors = ["access_denied", "login_required", "consent_required", "interaction_required", "account_selection_required", "invalid_request", "invalid_scope", "unauthorized_client", "unsupported_response_type"];
export type PostNavigation = { kind: "post"; action: string; fields: Record<string, string> };
export async function callbackForm(request: Request) {
  if (new URL(request.url).search || !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) throw new AuthError("INVALID_CALLBACK", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("INVALID_CALLBACK", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 8192) throw new AuthError("INPUT_TOO_LARGE", 413); chunks.push(chunk.value); }
  } catch (error) { void reader.cancel().catch(() => {}); throw error instanceof AuthError ? error : new AuthError("INVALID_CALLBACK", 400); }
  let body: string;
  try { body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); } catch { throw new AuthError("INVALID_CALLBACK", 400); }
  if (/%(?![0-9a-f]{2})/i.test(body)) throw new AuthError("INVALID_CALLBACK", 400);
  const params = new URLSearchParams(body), error = params.get("error"), keys = error ? ["error", "state", "iss"] : ["code", "state", "iss"];
  if ([...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length !== 1) || keys.some(key => !params.get(key)) || !/^[A-Za-z0-9_-]{1,128}$/.test(params.get("state") ?? "") || params.get("iss") !== centerConfig().issuer || error && !oauthErrors.includes(error)) throw new AuthError("INVALID_CALLBACK", 400);
  return { body, params };
}
export function callbackOrigin(request: Request) {
  const config = centerConfig();
  if (request.headers.get("host") !== new URL(config.origin).host || request.headers.get("origin") !== new URL(config.issuer).origin || request.headers.get("sec-fetch-mode") !== "navigate" || request.headers.get("sec-fetch-dest") !== "document") throw new AuthError("ORIGIN_REJECTED", 403);
}
const script = 'document.getElementById("oauth-post").submit();';
const hash = createHash("sha256").update(script).digest("base64");
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
export function postFormResponse(navigation: PostNavigation) {
  const config = centerConfig(), origin = new URL(config.issuer).origin;
  if (navigation.action !== config.issuer + "/oauth2/authorize") throw new AuthError("INVALID_AUTHENTICATION", 503);
  return new NextResponse(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin"><title>继续登录</title></head><body><form id="oauth-post" method="post" action="${escape(navigation.action)}">${Object.entries(navigation.fields).map(([key, value]) => `<input type="hidden" name="${escape(key)}" value="${escape(value)}">`).join("")}<button type="submit">继续</button></form><script>${script}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "strict-origin", "Content-Security-Policy": `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action ${origin}; script-src 'sha256-${hash}'` } });
}
