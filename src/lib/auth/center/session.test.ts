// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authTestEnv } from "@/test/auth-center";
const mocks = vi.hoisted(() => ({ query: vi.fn(), checkUser: vi.fn(), verifyToken: vi.fn(), introspect: vi.fn() }));
vi.mock("./store", async original => ({ ...await original<typeof import("./store")>(), query: mocks.query }));
vi.mock("./protocol", () => ({ introspect: mocks.introspect }));
vi.mock("@/db/userAction", () => ({ checkUser: mocks.checkUser }));
vi.mock("@/lib/jwt", () => ({ verifyToken: mocks.verifyToken }));
import { AuthError } from "./config";
import { randomToken, seal, sessionAAD } from "./crypto";
import { cookieNames } from "./store";
import { legacyIdentity, resolveIdentity } from "./session";

const legacy = { id: "old-user", email: "old@unit.test", username: "Original", avatar: null, role: "ROOT", authMode: "legacy", authVersion: 0 };
let row: Record<string, unknown>, cookies: Map<string, string>;
const read = (name: string) => cookies.get(name);
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value);
  cookies = new Map([["token", "old-jwt"]]);
  mocks.verifyToken.mockReturnValue({ userId: legacy.id, role: "USER" });
  mocks.checkUser.mockResolvedValue({ ...legacy });
  row = { id: "session-a", identity_id: "identity-a", user_id: legacy.id, auth_version: 1,
    grant_encrypted: seal("grant-a", sessionAAD("session-a", "identity-a")), subject: "subject-a", center_session_id: "sid-a",
    center_token_expires_at: new Date(Date.now() + 60000), verified_email: "center@unit.test", email_verified_at: new Date() };
  mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT s.*") ? [row] : []);
  mocks.introspect.mockResolvedValue({ sub: "subject-a", sid: "sid-a" });
});
afterEach(() => vi.unstubAllEnvs());
function opaque() {
  cookies.set(cookieNames().session, randomToken()); cookies.set(cookieNames().browser, randomToken());
  mocks.checkUser.mockResolvedValue({ ...legacy, authMode: "center", authVersion: 1 });
}
describe("0003 protected identity resolution", () => {
  it.each(["closed", "probe", "owner"])("uses center introspection and the local mapping regardless of stale local phase %s", async phase => {
    opaque();
    vi.stubEnv("USER_CENTER_ONBOARDING_ENABLED", "false"); vi.stubEnv("FELINE_REGISTRATION_MODE", "closed");
    vi.stubEnv("PERSONAL_TRIAL_POLICY", JSON.stringify([1, phase, "https://auth.zhaosie.com/api/auth", "other-subject", "other-blog", "probe-subject", "probe-blog"]));
    expect(await resolveIdentity(read)).toMatchObject({ id: legacy.id, role: "ROOT" }); expect(mocks.introspect).toHaveBeenCalledOnce(); expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
  it("takes the local account from the real mapping instead of stale trial metadata", async () => {
    opaque();
    vi.stubEnv("USER_CENTER_ONBOARDING_ENABLED", "false"); vi.stubEnv("FELINE_REGISTRATION_MODE", "closed");
    vi.stubEnv("PERSONAL_TRIAL_POLICY", JSON.stringify([1, "owner", "https://auth.zhaosie.com/api/auth", "subject-a", "wrong-blog", "", ""]));
    expect(await resolveIdentity(read)).toMatchObject({ id: legacy.id }); expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
  it("AC-2 AC-9 accepts pre-migration version zero and uses the live database role", async () => {
    expect(await legacyIdentity(read)).toMatchObject({ id: legacy.id, role: "ROOT" });
  });
  it.each([{ authMode: "center", authVersion: 1 }, { authMode: "legacy", authVersion: 2 }])("AC-8 rejects old JWT after mode/version changes %s", async change => {
    mocks.checkUser.mockResolvedValue({ ...legacy, ...change });
    expect(await legacyIdentity(read)).toBeNull();
  });
  it("AC-8 refuses malformed credential versions", async () => {
    mocks.verifyToken.mockReturnValue({ userId: legacy.id, authVersion: "0" });
    expect(await legacyIdentity(read)).toBeNull(); expect(mocks.checkUser).not.toHaveBeenCalled();
  });
  it("AC-12 AC-13 decrypts only this session grant and checks its exact identity each time", async () => {
    opaque();
    for (let n = 0; n < 2; n++) expect(await resolveIdentity(read)).toMatchObject({ id: legacy.id, role: "ROOT", centerEmail: "center@unit.test" });
    expect(mocks.introspect).toHaveBeenCalledTimes(2);
    expect(mocks.introspect).toHaveBeenCalledWith("grant-a", { sub: "subject-a", sid: "sid-a", exp: Math.floor((row.center_token_expires_at as Date).getTime() / 1000) });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
  it("AC-8 refuses to fall back to JWT when the opaque credential has no live row", async () => {
    opaque(); mocks.query.mockResolvedValue([]);
    expect(await resolveIdentity(read)).toBeNull(); expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
  it("AC-16 refuses a session copied without its browser cookie", async () => {
    opaque(); cookies.delete(cookieNames().browser);
    expect(await resolveIdentity(read)).toBeNull(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("AC-13 revokes a definitively inactive center session", async () => {
    opaque(); mocks.introspect.mockRejectedValue(new AuthError("SESSION_REVOKED"));
    expect(await resolveIdentity(read)).toBeNull();
    expect(mocks.query).toHaveBeenCalledWith("SELECT public.revoke_local_session($1)", ["session-a"]);
  });
  it("AC-15 preserves the local session during a retryable center outage and never uses the JWT", async () => {
    opaque(); mocks.introspect.mockRejectedValue(new AuthError("CENTER_UNAVAILABLE", 503));
    await expect(resolveIdentity(read)).rejects.toMatchObject({ status: 503 });
    expect(mocks.query).toHaveBeenCalledTimes(1); expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
  it("AC-12 rejects a grant encrypted for a different local session", async () => {
    opaque(); row.grant_encrypted = seal("other-grant", sessionAAD("other-session", "identity-a"));
    await expect(resolveIdentity(read)).rejects.toMatchObject({ code: "CREDENTIAL_UNAVAILABLE", status: 503 });
    expect(mocks.introspect).not.toHaveBeenCalled();
  });
  it("AC-15 propagates database failures without declaring an anonymous identity", async () => {
    opaque(); mocks.query.mockRejectedValue(new AuthError("DATABASE_UNAVAILABLE", 503));
    await expect(resolveIdentity(read)).rejects.toMatchObject({ status: 503 });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
});
