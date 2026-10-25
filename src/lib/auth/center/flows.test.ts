// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/db/userAction", () => ({ checkUser: vi.fn() }));
import { authTestEnv } from "@/test/auth-center";
import { flowProof, verifyFlowProof, startFlow } from "./flows";
import type { BrowserState, Flow } from "./store";
const browser: BrowserState = { id: "browser-a", epoch: 4, current_flow_id: "flow-a", require_fresh_auth: false, last_logout_at: null, expires_at: new Date(Date.now() + 600000) };
const flow = { id: "flow-a", browser_epoch: 4, confirmation_revision: 1, candidate_digest: "candidate-a", legacy_user_id: "old-user-a", legacy_auth_version: 0, expires_at: new Date(Date.now() + 300000) } as Flow;
beforeEach(() => { for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
describe("0003 page intent proof", () => {
  it("requires legacy identity proof before starting a binding transaction", async () => {
    await expect(startFlow(() => undefined, browser, "bind", "/profile")).rejects.toMatchObject({ code: "LEGACY_PROOF_REQUIRED" });
  });
  it("AC-5 AC-18 accepts only the exact candidate and action shown to the user", () => {
    const proof = flowProof("bind", browser, flow);
    expect(() => verifyFlowProof(proof, "bind", browser, flow)).not.toThrow();
    expect(() => verifyFlowProof(proof, "cancel", browser, flow)).toThrow("FLOW_REPLACED");
    expect(() => verifyFlowProof(proof, "onboarding", browser, flow)).toThrow("FLOW_REPLACED");
  });
  it.each([{ id: "flow-b" }, { browser_epoch: 5 }, { confirmation_revision: 2 }, { candidate_digest: "candidate-b" }, { legacy_user_id: "old-user-b" }, { legacy_auth_version: 1 }])("AC-17 AC-18 rejects a replaced page binding %j", patch => {
    const proof = flowProof("bind", browser, flow);
    expect(() => verifyFlowProof(proof, "bind", browser, { ...flow, ...patch })).toThrow("FLOW_REPLACED");
  });
  it("AC-18 separates browsers and expires rather than sliding on reads", () => {
    const proof = flowProof("bind", browser, flow);
    expect(() => verifyFlowProof(proof, "bind", { ...browser, id: "browser-b" }, flow)).toThrow("FLOW_REPLACED");
    const expired = { ...flow, expires_at: new Date(Date.now() - 1) };
    expect(() => verifyFlowProof(flowProof("bind", browser, expired), "bind", browser, expired)).toThrow("FLOW_REPLACED");
  });
});
