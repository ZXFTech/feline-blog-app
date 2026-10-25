// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authTestEnv } from "@/test/auth-center";
vi.mock("./transport", () => ({ nativeFetch: (url: string, options: RequestInit) => fetch(url, options) }));
vi.mock("@/db/userAction", () => ({ checkUser: vi.fn() }));
vi.mock("@/db/postgres/runtime", () => ({ postgresPool: { query: vi.fn() } }));
import { authorization } from "./protocol";
import { authHttp } from "./http";
const issuer = authTestEnv.USER_CENTER_ISSUER;
beforeEach(() => {
  for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ issuer, authorization_endpoint: issuer + "/oauth2/authorize", token_endpoint: issuer + "/oauth2/token", userinfo_endpoint: issuer + "/oauth2/userinfo", introspection_endpoint: issuer + "/oauth2/introspect", jwks_uri: issuer + "/jwks", response_modes_supported: ["form_post"], response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("0007 blog form transport", () => {
  it("AC-P2 emits a fixed authorization action and body fields", async () => {
    expect(await authorization({ state: "state-a", nonce: "nonce-a", verifier: "verifier-a" }, true)).toMatchObject({ kind: "post", action: issuer + "/oauth2/authorize", fields: { state: "state-a", nonce: "nonce-a", response_mode: "form_post", prompt: "login", max_age: "0" } });
  });
  it("AC-P5 closes old GET callback without redirect or protocol work", async () => {
    const response = await authHttp(new Request(authTestEnv.FELINE_PUBLIC_ORIGIN + "/api/auth/callback/user-center?code=private&state=private"), "callback");
    expect(response.status).toBe(405);
    expect(response.headers.has("Location")).toBe(false);
    expect(await response.text()).not.toContain("private");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, "null", "https://evil.invalid", "http://other.localhost:18080"])("AC-P6 rejects callback Origin %s", async origin => {
    const response = await authHttp(new Request(authTestEnv.FELINE_PUBLIC_ORIGIN + "/api/auth/callback/user-center", { method: "POST", headers: { Host: "localhost:13000", ...(origin ? { Origin: origin } : {}), "Content-Type": "application/x-www-form-urlencoded", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" }, body: "code=private&state=private&iss=" + encodeURIComponent(issuer) }), "callback");
    expect(response.status).toBe(403);
    expect(response.headers.has("Location")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
