// @vitest-environment node
import { describe, expect, it } from "vitest";
import { authTestEnv } from "@/test/auth-center";
import { centerConfig } from "./config";

const production = { ...authTestEnv, NODE_ENV: "production", FELINE_PUBLIC_ORIGIN: "https://blog.zhaosie.com", USER_CENTER_ISSUER: "https://auth.zhaosie.com/api/auth", USER_CENTER_ONBOARDING_ENABLED: "false", FELINE_REGISTRATION_MODE: "closed" };

describe("center owned admission", () => {
  it("accepts production OIDC configuration without a local trial policy", () => {
    expect(() => centerConfig(production)).not.toThrow();
    expect(centerConfig(production)).not.toHaveProperty("personalTrial");
  });
  it.each(["closed", "probe", "owner"])("does not replicate center phase %s or identity allowlists", phase => {
    const config = centerConfig({ ...production, PERSONAL_TRIAL_POLICY: JSON.stringify([1, phase, production.USER_CENTER_ISSUER, "other-owner", "other-blog", "other-probe", "other-probe-blog"]), USER_CENTER_LOGIN_ENABLED: "false", USER_CENTER_BINDING_ENABLED: "false" });
    expect(config).not.toHaveProperty("personalTrial");
    expect(config).not.toHaveProperty("login");
    expect(config).not.toHaveProperty("binding");
  });
  it("cannot reopen registration through stale environment values", () => {
    const config = centerConfig({ ...production, USER_CENTER_ONBOARDING_ENABLED: "true", FELINE_REGISTRATION_MODE: "center" });
    expect(config.registration).toBe("closed");
  });
});
