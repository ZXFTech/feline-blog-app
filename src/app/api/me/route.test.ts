import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ principal: vi.fn(), state: vi.fn() }));
vi.mock("@/lib/auth/sdk/server", () => ({
  getSdkIntegration: () => ({ getPrincipal: mocks.principal }),
}));
vi.mock("@/lib/auth/sdk/business", () => ({
  readInstallation: mocks.state,
  assertProfileAllowed: vi.fn(),
  SdkHostError: class extends Error {},
}));
import { GET } from "@/app/api/me/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.mockResolvedValue({ phase: "awaiting_restore" });
});
it("returns 401 for an anonymous SDK result", async () => {
  mocks.principal.mockResolvedValue({ status: "anonymous" });
  expect((await GET(new Request("https://blog.example.test/api/me"))).status).toBe(401);
  expect(mocks.state).not.toHaveBeenCalled();
});
it("returns 403 for incomplete profile with a finite next destination", async () => {
  mocks.principal.mockResolvedValue({ status: "mapping-required" });
  const response = await GET(new Request("https://blog.example.test/api/me"));
  expect(response.status).toBe(403);
  expect(response.headers.get("x-auth-next")).toBe("/auth/setup");
});
it("returns 503 for dependency failure", async () => {
  mocks.principal.mockRejectedValue(Error("ENVIRONMENT_MISMATCH"));
  expect((await GET(new Request("https://blog.example.test/api/me"))).status).toBe(503);
});
it("returns only business projection and current authentication email", async () => {
  mocks.principal.mockResolvedValue({
    status: "authenticated",
    identity: { profile: { email: "auth@example.test" } },
    user: { id: "new", username: "Reader", email: "confirmed@example.test", role: "USER" },
  });
  const response = await GET(new Request("https://blog.example.test/api/me"));
  const body = await response.json();
  expect(body.data.user.email).toBe("confirmed@example.test");
  expect(body.data.authenticationEmail).toBe("auth@example.test");
  expect(body.data.installation.phase).toBe("awaiting_restore");
  expect(JSON.stringify(body)).not.toMatch(/token|password|secret/i);
});
