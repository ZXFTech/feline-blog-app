// @vitest-environment node
import { generateKeyPairSync, sign as rsaSign } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authTestEnv } from "@/test/auth-center";
vi.mock("./transport", () => ({ nativeFetch: (url: string, options: RequestInit) => fetch(url, options) }));
import { exchange, freshAuth, validateGrant } from "./protocol";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = authTestEnv.USER_CENTER_ISSUER;
const protocol = { state: "state-a", nonce: "nonce-a", verifier: "verifier-a" };
const now = Math.floor(Date.now() / 1000);
let claims: Record<string, unknown>, invalidSignature: boolean, missingToken: boolean;
function token() {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const body = head + "." + payload;
  return body + "." + rsaSign("RSA-SHA256", Buffer.from(body), invalidSignature ? other.privateKey : pair.privateKey).toString("base64url");
}
beforeEach(() => {
  for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value);
  claims = { iss: issuer, sub: "center-a", aud: "feline-blog", iat: now, exp: now + 300, nonce: protocol.nonce, auth_time: now };
  invalidSignature = false; missingToken = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const path = new URL(input).pathname;
    let body;
    if (path.includes(".well-known")) body = { issuer, authorization_endpoint: issuer + "/oauth2/authorize", token_endpoint: issuer + "/oauth2/token", userinfo_endpoint: issuer + "/oauth2/userinfo", introspection_endpoint: issuer + "/oauth2/introspect", jwks_uri: issuer + "/jwks", id_token_signing_alg_values_supported: ["RS256"], response_types_supported: ["code"], subject_types_supported: ["public"] };
    else if (path.endsWith("/token")) body = { access_token: "grant-a", token_type: "Bearer", expires_in: 300, ...(!missingToken ? { id_token: token() } : {}) };
    else if (path.endsWith("/jwks")) body = { keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" }] };
    else if (path.endsWith("/userinfo")) body = { sub: "center-a", email: "verified@unit.test", email_verified: true, name: "Cat" };
    else if (path.endsWith("/introspect")) body = { active: true, sub: "center-a", sid: "sid-a", exp: now + 300, client_id: "feline-blog", scope: "openid email profile" };
    else throw new Error("unexpected test endpoint");
    return Response.json(body);
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("0003 OIDC library verification", () => {
  const url = () => new URL("http://localhost:13000/api/auth/callback/user-center?code=one-use-code&state=state-a");
  it("AC-10 verifies a signed token using the real openid-client implementation", async () => {
    expect(await exchange(url(), protocol, new Date(now * 1000))).toMatchObject({ sub: "center-a", sid: "sid-a", email: "verified@unit.test" });
  });
  it("AC-10 AC-11 exchanges proxy callbacks using the registered public redirect URI", async () => {
    const internal = url(); internal.host = "0.0.0.0:3000";
    await exchange(internal, protocol, new Date(now * 1000));
    const request = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/token"));
    const body = new URLSearchParams(String(request?.[1]?.body));
    expect(body.get("redirect_uri")).toBe(authTestEnv.FELINE_PUBLIC_ORIGIN + "/api/auth/callback/user-center");
    expect(body.get("code")).toBe("one-use-code");
    expect(body.get("code_verifier")).toBe(protocol.verifier);
  });
  it("AC-10 rejects a callback on another path before contacting the provider", async () => {
    const wrong = url(); wrong.pathname = "/another-callback";
    await expect(exchange(wrong, protocol, null)).rejects.toMatchObject({ code: "INVALID_CALLBACK" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["signature", "issuer", "audience", "nonce", "expired", "auth-time", "missing-token", "state", "duplicate"])("AC-10 rejects %s without any persistence", async scenario => {
    const target = url();
    if (scenario === "signature") invalidSignature = true;
    if (scenario === "issuer") claims.iss = "https://wrong.invalid";
    if (scenario === "audience") claims.aud = "other";
    if (scenario === "nonce") claims.nonce = "wrong";
    if (scenario === "expired") claims.exp = now - 60;
    if (scenario === "auth-time") delete claims.auth_time;
    if (scenario === "missing-token") missingToken = true;
    if (scenario === "state") target.searchParams.set("state", "wrong");
    if (scenario === "duplicate") target.searchParams.append("state", "state-a");
    await expect(exchange(target, protocol, new Date(now * 1000))).rejects.toBeInstanceOf(Error);
  });
  it("AC-13 requires sid even if the provider claims the token is active", () => {
    expect(() => validateGrant({ active: true, sub: "a", client_id: "feline-blog", exp: now + 300, scope: "openid email profile" })).toThrow("SESSION_REVOKED");
  });
  it("AC-14 bounds seconds tolerance, freshness and future issuance", () => {
    const at = new Date(now * 1000);
    expect(freshAuth(now - 30, now, at, now * 1000)).toBe(true);
    for (const a of [now - 31, now + 31, undefined, "123", 0, NaN]) expect(freshAuth(a, now, at, now * 1000)).toBe(false);
  });
});
