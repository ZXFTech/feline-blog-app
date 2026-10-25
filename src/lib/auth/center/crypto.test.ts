// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authTestEnv } from "@/test/auth-center";
import { digest, randomToken, seal, sessionAAD, sign, unseal, verify } from "./crypto";
import { centerConfig } from "./config";
beforeEach(() => { for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
describe("0003 credentials", () => {
  it("AC-12 stores only independent opaque token hashes", () => {
    const first = randomToken(), second = randomToken();
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(first).not.toBe(second); expect(digest(first)).not.toContain(first);
  });
  it("AC-12 encrypts the same grant differently for every session and authenticates the AAD", () => {
    const aad = sessionAAD("session-a", "identity-a"), first = seal("private-grant", aad), second = seal("private-grant", aad);
    expect(first).not.toBe(second); expect(first).not.toContain("private-grant");
    expect(unseal(first, aad)).toBe("private-grant");
    expect(() => unseal(first, sessionAAD("session-b", "identity-a"))).toThrow("CREDENTIAL_UNAVAILABLE");
    expect(() => unseal(first.slice(0, -3) + "zzz", aad)).toThrow("CREDENTIAL_UNAVAILABLE");
  });
  it("AC-18 separates purposes and rejects changed signatures", () => {
    const signed = sign("flowProof", { action: "bind" });
    expect(verify("flowProof", signed)).toEqual({ action: "bind" });
    expect(() => verify("csrf", signed)).toThrow("INVALID_PROOF");
    expect(() => verify("flowProof", signed + "x")).toThrow("INVALID_PROOF");
  });
  it("AC-12 retains old decryption keys during rotation and rejects missing keys", () => {
    const sealed = seal("grant", "aad"), old = JSON.parse(authTestEnv.FELINE_GRANT_KEYRING);
    vi.stubEnv("FELINE_GRANT_KEYRING", JSON.stringify({ active: "new", keys: { ...old.keys, new: Buffer.alloc(32, 8).toString("base64") } }));
    expect(unseal(sealed, "aad")).toBe("grant");
    vi.stubEnv("FELINE_GRANT_KEYRING", JSON.stringify({ active: "new", keys: { new: Buffer.alloc(32, 8).toString("base64") } }));
    expect(() => unseal(sealed, "aad")).toThrow("CREDENTIAL_UNAVAILABLE");
  });
  it("AC-11 AC-16 fixes production domains, client and secure origins", () => {
    expect(centerConfig()).toMatchObject({ clientId: "feline-blog", production: false });
    for (const patch of [{ USER_CENTER_CLIENT_ID: "other" }, { USER_CENTER_ISSUER: "http://attacker.invalid/api/auth" }, { FELINE_SESSION_SECRET: "small" }]) expect(() => centerConfig({ ...authTestEnv, ...patch })).toThrow("CONFIGURATION_INVALID");
    expect(() => centerConfig({ ...authTestEnv, NODE_ENV: "production" })).toThrow("CONFIGURATION_INVALID");
  });
});
