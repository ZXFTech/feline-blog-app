// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authTestEnv } from "@/test/auth-center";
const mocks = vi.hoisted(() => ({ query: vi.fn(), txQuery: vi.fn(), transaction: vi.fn(), currentFlow: vi.fn(), browserState: vi.fn(), lockFlow: vi.fn(), identity: vi.fn(), exchange: vi.fn(), authorization: vi.fn(), introspect: vi.fn() }));
vi.mock("@/db/userAction", () => ({ checkUser: vi.fn() }));
vi.mock("./store", async original => ({ ...await original<typeof import("./store")>(), query: mocks.query, transaction: mocks.transaction, currentFlow: mocks.currentFlow, browserState: mocks.browserState, lockFlow: mocks.lockFlow }));
vi.mock("./session", () => ({ resolveIdentity: mocks.identity }));
vi.mock("./protocol", async original => ({ ...await original<typeof import("./protocol")>(), exchange: mocks.exchange, authorization: mocks.authorization, introspect: mocks.introspect }));
import { callback, flowProof, pendingPage, startFlow, submitFlow } from "./flows";
import { authHttp } from "./http";
import { digest, flowAAD, seal } from "./crypto";
import type { BrowserState, Flow } from "./store";

let browser: BrowserState, flow: Flow;
const candidate = () => ({ issuer: authTestEnv.USER_CENTER_ISSUER, sub: "center-approved-subject", email: "different@center.test", name: "Center", grant: "synthetic-grant", sid: "center-session", exp: Math.floor(Date.now() / 1000) + 300, authTime: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000), transport: "form_post-v1" as const });
const protocol = () => ({ state: "state-a", nonce: "nonce-a", verifier: "verifier-a", transport: "form_post-v1" });
const request = () => new Request(authTestEnv.FELINE_PUBLIC_ORIGIN + "/api/auth/callback/user-center", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: "synthetic-code", state: "state-a", iss: authTestEnv.USER_CENTER_ISSUER }) });
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value);
  browser = { id: "browser-a", epoch: 4, current_flow_id: "flow-a", require_fresh_auth: false, last_logout_at: null, expires_at: new Date(Date.now() + 600000) };
  flow = { id: "flow-a", purpose: "login", browser_state_id: browser.id, browser_epoch: 4, state_hash: digest("state-a"), protocol_encrypted: seal(protocol(), flowAAD("flow-a", "protocol")), candidate_encrypted: null, candidate_digest: null, confirmation_revision: 1, status: "created", created_at: new Date(), expires_at: new Date(Date.now() + 300000), legacy_user_id: null, legacy_auth_version: null, legacy_verified_at: null, require_fresh_auth: false, reauth_after: null, destination: "/profile" };
  mocks.currentFlow.mockImplementation(async () => ({ browser, flow }));
  mocks.browserState.mockImplementation(async () => ({ browser }));
  mocks.lockFlow.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async run => run({ query: mocks.txQuery }));
  mocks.txQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT * FROM public.feline_auth_browser")) return { rows: [browser] };
    if (sql.includes("candidate_encrypted=$3")) { flow = { ...flow, status: values[1] as string, candidate_encrypted: values[2] as string, candidate_digest: values[3] as string }; return { rows: [flow] }; }
    return { rows: [flow] };
  });
  mocks.exchange.mockImplementation(async () => candidate());
  mocks.introspect.mockResolvedValue({ sub: candidate().sub });
  mocks.identity.mockResolvedValue({ id: "original-blog-id", authVersion: 0, authMode: "legacy", email: "old@blog.test", username: "Original", role: "ROOT" });
  mocks.authorization.mockResolvedValue({ kind: "post", action: authTestEnv.USER_CENTER_ISSUER + "/oauth2/authorize", fields: {} });
});
afterEach(() => vi.unstubAllEnvs());
function pending() {
  flow = { ...flow, purpose: "bind", status: "pending_confirmation", legacy_user_id: "original-blog-id", legacy_auth_version: 0, require_fresh_auth: true, reauth_after: new Date(), candidate_digest: "candidate-digest", candidate_encrypted: seal(candidate(), flowAAD(flow.id, "candidate")) };
}
describe("center admission with explicit local binding", () => {
  it("rejects an unmapped approved center identity instead of creating an account", async () => {
    await expect(callback(() => undefined, request())).rejects.toMatchObject({ code: "IDENTITY_NOT_BOUND", status: 403 });
    expect(mocks.exchange).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("WHERE issuer=$1 AND subject=$2"), [candidate().issuer, candidate().sub]);
    expect(mocks.txQuery.mock.calls.some(([sql]) => /candidate_encrypted=\$3|INSERT INTO public.users|complete_/.test(sql))).toBe(false);
  });
  it("logs in through the actual local mapping for any identity approved by the center", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("WHERE issuer=$1") ? [{ id: "identity-a", user_id: "original-blog-id" }] : []);
    const result = await callback(() => undefined, request());
    expect(result).toMatchObject({ location: "/profile", token: expect.any(String) });
    const call = mocks.query.mock.calls.find(([sql]) => sql.includes("complete_center_login"))!;
    expect(JSON.parse(call[1][0])).toMatchObject({ user: "original-blog-id", sub: candidate().sub });
    expect(mocks.introspect).toHaveBeenCalledOnce();
  });
  it("stops on a denied or unavailable center response without creating local identity", async () => {
    mocks.exchange.mockRejectedValue({ code: "INVALID_AUTHENTICATION", status: 401 });
    await expect(callback(() => undefined, request())).rejects.toMatchObject({ code: "INVALID_AUTHENTICATION" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("only prepares a confirmation after a bind callback", async () => {
    flow = { ...flow, purpose: "bind", legacy_user_id: "original-blog-id", legacy_auth_version: 0 };
    expect(await callback(() => undefined, request())).toEqual({ location: "/auth/user-center/confirm" });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(flow.status).toBe("pending_confirmation");
  });
  it("requires explicit confirmation before any final transaction", async () => {
    pending();
    await expect(submitFlow(() => undefined, flowProof("bind", browser, flow), "bind")).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(mocks.introspect).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("binds the original account with fresh center authentication and explicit proof", async () => {
    pending();
    await submitFlow(() => undefined, flowProof("bind", browser, flow), "bind", undefined, undefined, true);
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("complete_legacy_binding"), [expect.any(String)]);
    const payload = JSON.parse(mocks.query.mock.calls[0][1][0]);
    expect(payload).toMatchObject({ user: "original-blog-id", sub: candidate().sub, fresh: true, enabled: true });
    expect(payload).not.toHaveProperty("role");
  });
  it("rejects lost or changed legacy ownership before binding", async () => {
    pending(); mocks.identity.mockResolvedValue({ id: "other-blog-id", authMode: "legacy", authVersion: 0 });
    await expect(submitFlow(() => undefined, flowProof("bind", browser, flow), "bind", undefined, undefined, true)).rejects.toMatchObject({ code: "LEGACY_PROOF_REQUIRED" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects nonfresh center authentication before binding", async () => {
    pending(); flow.reauth_after = new Date(Date.now() + 120000);
    await expect(submitFlow(() => undefined, flowProof("bind", browser, flow), "bind", undefined, undefined, true)).rejects.toMatchObject({ code: "FRESH_AUTH_REQUIRED" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not continue an old trial authorization flow", async () => {
    flow.protocol_encrypted = seal({ ...protocol(), personalTrialDigest: "old-policy" }, flowAAD(flow.id, "protocol"));
    await expect(callback(() => undefined, request())).rejects.toMatchObject({ code: "FLOW_EXPIRED" });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("does not commit an old trial confirmation candidate", async () => {
    pending(); flow.candidate_encrypted = seal({ ...candidate(), personalTrialDigest: "old-policy" }, flowAAD(flow.id, "candidate"));
    await expect(submitFlow(() => undefined, flowProof("bind", browser, flow), "bind", undefined, undefined, true)).rejects.toMatchObject({ code: "FLOW_EXPIRED" });
    expect(mocks.introspect).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("never reopens onboarding or a stale choice page", async () => {
    await expect(submitFlow(() => undefined, "old-proof", "onboarding", "create", "New", true)).rejects.toMatchObject({ code: "ENTRY_UNAVAILABLE" });
    await expect(pendingPage(() => undefined, "pending_choice")).rejects.toMatchObject({ code: "ENTRY_UNAVAILABLE" });
    expect(mocks.currentFlow).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["register", "onboarding", "start"] as const)("closes HTTP %s before database or identity work", async operation => {
    const response = await authHttp(new Request(authTestEnv.FELINE_PUBLIC_ORIGIN + "/api/auth/user-center/" + operation, { method: "POST", headers: { Origin: authTestEnv.FELINE_PUBLIC_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(operation === "start" ? { intent: "register" } : { choice: "create", username: "New" }) }), operation);
    expect(response.status).toBe(operation === "register" ? 409 : 503);
    expect(mocks.currentFlow).not.toHaveBeenCalled(); expect(mocks.browserState).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("starts binding without a duplicated local allowlist or feature switch", async () => {
    vi.stubEnv("PERSONAL_TRIAL_POLICY", "obsolete"); vi.stubEnv("USER_CENTER_BINDING_ENABLED", "false");
    await startFlow(() => undefined, browser, "bind", "/profile", { id: "original-blog-id", authVersion: 0 });
    expect(mocks.authorization).toHaveBeenCalledWith(expect.not.objectContaining({ personalTrialDigest: expect.anything() }), true);
  });
});
