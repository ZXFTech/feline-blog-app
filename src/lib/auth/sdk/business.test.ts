// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { Identity } from "@user-center/next-better-auth/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), state: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  default: { user: { findUnique: mocks.user }, authInstallState: { findUnique: mocks.state } },
}));
vi.mock("@/lib/auth/sdk/config", () => ({
  getSdkConfiguration: () => ({ manifest: { issuer: "https://center.example.test/api/auth" } }),
}));
import {
  assertBusinessReady,
  assertProfileAllowed,
  readInstallation,
  resolveBusinessUser,
} from "./business";
const identity: Identity = {
  issuer: "https://center.example.test/api/auth",
  subject: "subject",
  authUserId: "new-user",
  profile: { name: "Auth name", email: "zxf_tech@outlook.com", emailVerified: true },
};
const row = () => ({
  id: "new-user",
  username: "Business name",
  profileEmailSnapshot: "confirmed@example.test",
  role: "USER",
  avatar: null,
  profileCompletedAt: new Date(),
  profileEmailConfirmedAt: new Date(),
  businessCreatedAt: new Date(),
  businessUpdatedAt: new Date(),
});
const ready = () => ({
  id: "primary",
  phase: "ready",
  revision: 3,
  targetGeneration: "generation",
  rootUserId: "new-user",
  rootInitializedAt: new Date(),
  rootIssuer: identity.issuer,
  rootSubjectDigest: "a".repeat(64),
  bootstrapPlanDigest: "b".repeat(64),
  restoreRunId: "receipt",
  activatedAt: new Date(),
  activationPlanDigest: "c".repeat(64),
  activationEvidenceRef: "review.json",
  activationEvidenceSha256: "d".repeat(64),
  restoreRun: { id: "receipt", targetGeneration: "generation", targetUserId: "new-user" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(row());
  mocks.state.mockResolvedValue(ready());
});
it("maps only the stable auth user ID and confirmed business columns", async () => {
  const result = await resolveBusinessUser(identity, {
    signal: new AbortController().signal,
    requestId: "fixture",
  });
  expect(mocks.user.mock.calls[0][0].where).toEqual({ id: "new-user" });
  expect(result).toMatchObject({
    status: "ready",
    user: { username: "Business name", email: "confirmed@example.test", role: "USER" },
  });
  expect(JSON.stringify(result)).not.toContain("Auth name");
});
it("leaves incomplete profiles unmapped", async () => {
  mocks.user.mockResolvedValue({ ...row(), profileCompletedAt: null });
  expect(
    await resolveBusinessUser(identity, {
      signal: new AbortController().signal,
      requestId: "fixture",
    })
  ).toEqual({ status: "unmapped" });
});
it("honors resolver cancellation while a read is still pending", async () => {
  mocks.user.mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const result = resolveBusinessUser(identity, { signal: controller.signal, requestId: "fixture" });
  controller.abort();
  await expect(result).rejects.toThrow("AUTH_UNAVAILABLE");
});
it("rejects missing state and a ready state bound to a different receipt generation or center", async () => {
  for (const state of [
    null,
    { ...ready(), rootIssuer: "https://other.example.test/api/auth" },
    { ...ready(), restoreRun: { ...ready().restoreRun, targetGeneration: "other" } },
    { ...ready(), restoreRun: null },
  ]) {
    mocks.state.mockResolvedValue(state);
    await expect(readInstallation()).rejects.toThrow("AUTH_UNAVAILABLE");
  }
});
it("keeps business closed before activation", async () => {
  mocks.state.mockResolvedValue({ ...ready(), phase: "awaiting_restore" });
  await expect(assertBusinessReady()).rejects.toThrow("INITIALIZATION_PENDING");
});
it("limits initialization account access without granting a role by email", async () => {
  const state = await readInstallation();
  expect(() => assertProfileAllowed({ ...state, phase: "awaiting_root" }, identity)).not.toThrow();
  expect(() =>
    assertProfileAllowed(
      { ...state, phase: "awaiting_root" },
      { ...identity, profile: { ...identity.profile, email: "other@example.test" } }
    )
  ).toThrow("INITIALIZATION_PENDING");
  expect(() =>
    assertProfileAllowed(
      { ...state, phase: "awaiting_restore" },
      { ...identity, authUserId: "other-user" }
    )
  ).toThrow("INITIALIZATION_PENDING");
});
