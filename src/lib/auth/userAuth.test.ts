import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ principal: vi.fn(), ready: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "token=old-jwt; feline-session=old-session" }),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("@/lib/auth/sdk/server", () => ({
  getSdkIntegration: () => ({ getPrincipal: state.principal }),
}));
vi.mock("@/lib/auth/sdk/business", () => ({
  assertBusinessReady: state.ready,
  assertProfileStage: vi.fn(),
}));
import {
  getCurrentUser,
  hasBlogRoles,
  hasRootRole,
  hasTodoRoles,
  requireAuth,
  resolveAccountUser,
} from "@/lib/auth/userAuth";
const user = {
  id: "new-auth-user",
  username: "Reader",
  email: "confirmed@example.test",
  role: "USER",
  avatar: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  authMode: "sdk",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.ready.mockResolvedValue(undefined);
  state.principal.mockResolvedValue({ status: "anonymous" });
});
describe("SDK principal and business guards", () => {
  it("ignores legacy cookies when the SDK reports anonymous", async () => {
    expect((await requireAuth()).status).toBe("unauthenticated");
    expect(state.ready).not.toHaveBeenCalled();
  });
  it("keeps missing business mapping forbidden", async () => {
    state.principal.mockResolvedValue({
      status: "mapping-required",
      identity: { authUserId: "new" },
    });
    expect((await requireAuth()).status).toBe("forbidden");
  });
  it("keeps a dependency outage distinct from anonymous", async () => {
    state.principal.mockRejectedValue(Error("ENVIRONMENT_MISMATCH"));
    expect((await requireAuth()).status).toBe("temporary_failure");
    expect(await getCurrentUser()).toBeNull();
  });
  it("allows account inspection during maintenance while business guards fail closed", async () => {
    state.principal.mockResolvedValue({ status: "authenticated", user });
    state.ready.mockRejectedValue(Error("INITIALIZATION_PENDING"));
    expect((await resolveAccountUser()).status).toBe("success");
    expect((await requireAuth()).status).toBe("temporary_failure");
  });
  it("does not grant ordinary users ROOT/Todo/Blog permissions", async () => {
    state.principal.mockResolvedValue({ status: "authenticated", user });
    for (const guard of [hasBlogRoles, hasTodoRoles, hasRootRole])
      expect((await guard()).status).toBe("forbidden");
  });
  it("keeps the authenticated business ID and permits ROOT after readiness", async () => {
    state.principal.mockResolvedValue({ status: "authenticated", user: { ...user, role: "ROOT" } });
    const result = await hasRootRole();
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.data.id).toBe(user.id);
  });
});
