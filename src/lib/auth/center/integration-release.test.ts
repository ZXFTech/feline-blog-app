// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateIntegrationRelease } from "./integration-release";

const fixture = () => ({ schemaVersion: 3, releaseId: "11111111-1111-4111-8111-111111111111", source: { repositoryId: "LOCAL_SYNTHETIC", commitSha: "a".repeat(40), inputDigest: "sha256:" + "b".repeat(64), clean: true }, target: { service: "blog", profile: "feline-blog", purpose: "feline-integration", secrets: Object.fromEntries(["session", "grant", "client", "ops"].map(name => [name, { version: name + "/1", digest: "c".repeat(64) }])) } });
describe("independent blog release contract", () => {
  it("requires no copied center policy or identity list", () => expect(() => validateIntegrationRelease(fixture())).not.toThrow());
  it.each([1, 2])("rejects schema %s", schemaVersion => expect(() => validateIntegrationRelease({ ...fixture(), schemaVersion })).toThrow("INTEGRATION_RELEASE_INVALID"));
  it.each([
    { service: "center" }, { profile: "center" }, { profile: undefined }, { purpose: "personal-trial" },
    { personalTrial: { phase: "owner" } }, { accountAdmission: {} }, { allowAll: true },
    { secrets: { session: {} } },
  ])("rejects mixed or incomplete target %#", patch => expect(() => validateIntegrationRelease({ ...fixture(), target: { ...fixture().target, ...patch } })).toThrow("INTEGRATION_RELEASE_INVALID"));
  it("rejects unrecognized source fields", () => expect(() => validateIntegrationRelease({ ...fixture(), source: { ...fixture().source, approved: true } })).toThrow("INTEGRATION_RELEASE_INVALID"));
  it("rejects extra secret fields", () => { const input = fixture(); input.target.secrets.ops = { ...input.target.secrets.ops, raw: "private" } as typeof input.target.secrets.ops; expect(() => validateIntegrationRelease(input)).toThrow("INTEGRATION_RELEASE_INVALID"); });
});
