// @vitest-environment node
import { describe, expect, it } from "vitest";
import { authTestEnv } from "@/test/auth-center";
import { centerConfig, destination } from "./config";
describe("0003 fixed client configuration", () => {
  it("AC-11 AC-16 fixes production origins, callback, client, scope and host cookie prefix", () => {
    expect(centerConfig({ ...authTestEnv, NODE_ENV: "production", FELINE_PUBLIC_ORIGIN: "https://blog.zhaosie.com", USER_CENTER_ISSUER: "https://auth.zhaosie.com/api/auth" })).toMatchObject({ clientId: "feline-blog", callback: "https://blog.zhaosie.com/api/auth/callback/user-center", cookiePrefix: "__Host-feline-", scope: "openid email profile" });
  });
  it.each([
    { FELINE_PUBLIC_ORIGIN: "https://sibling.zhaosie.com" },
    { USER_CENTER_ISSUER: "https://other.invalid/api/auth" },
    { USER_CENTER_CLIENT_ID: "other" },
    { USER_CENTER_BINDING_ENABLED: "yes" },
    { FELINE_REGISTRATION_MODE: "legacy" },
    { FELINE_SESSION_SECRET: "short" },
    { USER_CENTER_CLIENT_SECRET: "short" },
    { USER_CENTER_CLIENT_SECRET: authTestEnv.FELINE_SESSION_SECRET },
    { FELINE_GRANT_KEYRING: JSON.stringify({ active: "same", keys: { same: authTestEnv.FELINE_SESSION_SECRET } }) },
  ])("AC-11 AC-21 fails closed for invalid production configuration %s", override => {
    expect(() => centerConfig({ ...authTestEnv, NODE_ENV: "production", FELINE_PUBLIC_ORIGIN: "https://blog.zhaosie.com", USER_CENTER_ISSUER: "https://auth.zhaosie.com/api/auth", ...override })).toThrow();
  });
  it.each(["contains.dot", "", "__proto__", "a".repeat(65), undefined, null, 42])("AC-12 rejects unusable key identifiers before a binding can commit: %s", id => {
    const keys = Object.fromEntries([[id, Buffer.alloc(32, 1).toString("base64")]]);
    expect(() => centerConfig({ ...authTestEnv, FELINE_GRANT_KEYRING: JSON.stringify({ active: id, keys }) })).toThrow("CONFIGURATION_INVALID");
  });
  it("AC-18 accepts only named safe destinations", () => {
    expect(["home", "profile", "dashboard"].map(destination)).toEqual(["/", "/profile", "/dashboard"]);
    for (const value of ["https://evil.invalid", "//evil.invalid", "/profile", "constructor", "__proto__", null]) expect(destination(value)).toBeUndefined();
  });
});
