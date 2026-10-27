import { describe, expect, it } from "vitest";
import { validatedNavigation } from "./auth-navigation";

const routes = { centerOrigin: "https://auth.example.test", blogOrigin: "https://blog.example.test" };
const fields = { client_id: "feline-blog", redirect_uri: routes.blogOrigin + "/api/auth/callback/user-center", response_type: "code", response_mode: "form_post", scope: "openid email profile", state: "state-1", nonce: "nonce-1", code_challenge: "a".repeat(43), code_challenge_method: "S256" };
const post = (values: object) => ({ kind: "post", action: routes.centerOrigin + "/api/auth/oauth2/authorize", fields: values });
describe("finite authentication navigation", () => {
  it("accepts only registered HTTPS actions and exact DTO keys", () => {
    expect(validatedNavigation(post(fields), routes)).toEqual(post(fields));
    for (const input of [{ ...post(fields), action: routes.centerOrigin + ".evil.test/api/auth/oauth2/authorize" }, { ...post(fields), html: "unexpected" }, { kind: "page", path: "/auth/sign-in?state=secret" }, { kind: "continue", action: "/auth/continue", flowContext: { kind: "none" } }, { kind: "entry", app: ["center"] }]) expect(() => validatedNavigation(input, routes)).toThrow("NAVIGATION_UNAVAILABLE");
  });
  it.each([{ state: "s".repeat(129) }, { nonce: "bad value" }, { code_challenge: "short" }, { scope: "openid admin" }, { scope: "openid openid" }, { prompt: "none login" }, { prompt: "login login" }, { max_age: "1" }])("rejects an invalid authorize field set %j", mutation => {
    expect(() => validatedNavigation(post({ ...fields, ...mutation }), routes)).toThrow("NAVIGATION_UNAVAILABLE");
  });
  it("accepts a known OAuth error but rejects arbitrary errors and oversized encoded forms", () => {
    const action = routes.blogOrigin + "/api/auth/callback/user-center", base = { state: "state-1", iss: routes.centerOrigin + "/api/auth" };
    expect(validatedNavigation({ kind: "post", action, fields: { ...base, error: "access_denied" } }, routes).kind).toBe("post");
    for (const callbackFields of [{ ...base, error: "server_error" }, { ...base, error: "unknown" }, { ...base, code: "密".repeat(2000) }]) expect(() => validatedNavigation({ kind: "post", action, fields: callbackFields }, routes)).toThrow("NAVIGATION_UNAVAILABLE");
  });
});
