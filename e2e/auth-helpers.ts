import type { APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
const initialized = new WeakSet<APIRequestContext>();
export async function authPost(request: APIRequestContext, path: string, data: object = {}) {
  // Shared regression accounts get a fresh budget for each isolated test context.
  // Rate-limit assertions use their own dedicated tests and do not call this reset.
  if (process.env.FELINE_AUTH_FIXTURE_FILE && !initialized.has(request)) {
    const target = new URL(process.env.FELINE_AUTH_TEST_DATABASE_URL!);
    if (target.hostname !== "127.0.0.1" || target.port !== "54346" || target.pathname !== "/feline_blog_dev") throw new Error("Unsafe fixture target");
    const pool = new Pool({ connectionString: target.href, max: 1 });
    try { await pool.query("DELETE FROM feline_auth_rate"); } finally { await pool.end(); }
    initialized.add(request);
  }
  const csrfResponse = await request.get("/api/auth/csrf");
  if (!csrfResponse.ok()) throw new Error(`Authentication CSRF unavailable (HTTP ${csrfResponse.status()})`);
  const csrf = await csrfResponse.json();
  return request.post(`/api/auth/${path}`, { headers: { Origin: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000", Accept: "application/json" }, data: { ...data, csrfToken: csrf.data.csrfToken } });
}

// Capture once for this HTTP page interaction. Old-page tests retain their own snapshot.
export async function capturedCenterFlow(request: APIRequestContext) {
  const state = await request.storageState();
  const cookie = state.cookies.find(cookie => cookie.domain === "auth.zhaosie.com" && cookie.name.endsWith(".oauth-flow"));
  if (!cookie) throw Error("CAPTURED_OAUTH_PAGE_REQUIRED");
  return { kind: "oauth" as const, query: Buffer.from(cookie.value, "base64url").toString("utf8") };
}
