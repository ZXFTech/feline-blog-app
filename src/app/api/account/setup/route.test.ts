import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), rate: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/sdk/config", () => ({
  getSdkConfiguration: () => ({ manifest: { platformOrigin: "https://blog.example.test" } }),
}));
vi.mock("@/lib/auth/sdk/server", () => ({
  getSdkIntegration: () => ({ getIdentity: mocks.identity }),
}));
vi.mock("@/lib/auth/sdk/profile", () => ({
  consumeProfileRate: mocks.rate,
  saveProfile: mocks.save,
  trustedProfileIp: () => "no-trusted-ip",
}));
import { SdkHostError } from "@/lib/auth/sdk/business";
import { POST } from "./route";
const payload = {
  action: "complete-profile",
  username: "Reader",
  emailConfirmed: true,
  emailSnapshotDigest: "a".repeat(64),
};
const request = (body: unknown = payload, headers: Record<string, string> = {}) =>
  new Request("https://blog.example.test/api/account/setup", {
    method: "POST",
    headers: {
      Origin: "https://blog.example.test",
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockResolvedValue(true);
  mocks.identity.mockResolvedValue({ authUserId: "new-user" });
  mocks.save.mockResolvedValue({ returnTo: "/profile", user: { id: "new-user", role: "USER" } });
});
it.each<Record<string, string>>([
  { Origin: "https://other.example.test" },
  { Origin: "" },
  { "sec-fetch-site": "cross-site" },
])("rejects a foreign or missing origin before rate or identity work", async (headers) => {
  expect((await POST(request(payload, headers))).status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled();
  expect(mocks.rate).not.toHaveBeenCalled();
});
it("accepts only JSON and strict bounded DTOs", async () => {
  expect(
    (await POST(request(payload, { "Content-Type": "application/x-www-form-urlencoded" }))).status
  ).toBe(415);
  for (const body of [
    "invalid json",
    "x".repeat(4097),
    { ...payload, role: "ROOT" },
    { ...payload, email: "browser@example.test" },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not save an anonymous identity", async () => {
  mocks.identity.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not auto retry profile rate limits", async () => {
  mocks.rate.mockResolvedValue(false);
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(mocks.identity).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("takes the user ID only from the SDK and returns no authentication secrets", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.save).toHaveBeenCalledWith({ authUserId: "new-user" }, payload);
  expect(await response.json()).toMatchObject({
    data: { user: { id: "new-user", role: "USER" }, returnTo: "/profile" },
  });
});
it.each([
  ["PROFILE_CONFLICT", 409],
  ["INITIALIZATION_PENDING", 403],
  ["PROFILE_REQUIRED", 403],
  ["AUTH_UNAVAILABLE", 503],
] as const)("keeps %s distinct", async (code, status) => {
  mocks.save.mockRejectedValue(new SdkHostError(code));
  expect((await POST(request())).status).toBe(status);
});
