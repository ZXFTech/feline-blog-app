import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import logger from "@/lib/logger/Logger";
const ready = vi.hoisted(() => vi.fn());
const principal = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/sdk/business", () => ({
  assertBusinessReady: ready,
  SdkHostError: class extends Error {},
}));
vi.mock("@/lib/auth/sdk/server", () => ({
  getSdkIntegration: () => ({ getPrincipal: principal }),
}));
vi.mock("@/lib/auth/sdk/config", () => ({
  getSdkConfiguration: () => ({
    manifest: {
      returnTo: {
        fallback: "/profile",
        allowedPaths: ["/profile", "/todo"],
        allowedPathPrefixes: [],
        allowedQueryKeys: [],
      },
    },
  }),
}));
import { proxy } from "@/proxy";
beforeEach(() => {
  ready.mockReset();
  ready.mockResolvedValue(undefined);
  principal.mockReset();
  principal.mockResolvedValue({ status: "anonymous" });
});
it("returns maintenance 503 for public business API when not ready", async () => {
  ready.mockRejectedValue(Error("INITIALIZATION_PENDING"));
  const response = await proxy(new NextRequest("https://blog.example.test/api/blog"));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("returns a direct service document with HTTP 503 for public business pages", async () => {
  const diagnostic = vi.spyOn(logger, "log").mockImplementation(() => {});
  ready.mockRejectedValue(Error("private driver message must not be logged"));
  const response = await proxy(new NextRequest("https://blog.example.test/blog/1"));
  expect(response.status).toBe(503);
  expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  expect(await response.text()).toContain("业务维护中");
  expect(diagnostic).toHaveBeenCalledWith(
    expect.stringContaining('"event":"feline_business_gate"')
  );
  expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("private driver message");
  diagnostic.mockRestore();
});
it("preserves an allowed original target when an unmapped user returns during initialization", async () => {
  ready.mockRejectedValue(Error("INITIALIZATION_PENDING"));
  principal.mockResolvedValue({ status: "mapping-required" });
  const response = await proxy(new NextRequest("https://blog.example.test/todo"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://blog.example.test/auth/setup?returnTo=%2Ftodo"
  );
});
it.each([
  "/login",
  "/auth/setup",
  "/profile",
  "/api/me",
  "/api/account/setup",
  "/api/auth/get-session",
  "/album",
  "/api/health",
])("allows account and safe UI surface %s through maintenance", async (pathname) => {
  await proxy(new NextRequest(`https://blog.example.test${pathname}`));
  expect(ready).not.toHaveBeenCalled();
});
it("removes spoofed identity headers and binds the actual pathname", async () => {
  const response = await proxy(
    new NextRequest("https://blog.example.test/blog", {
      headers: { "x-user-id": "forged", "x-user-role": "ROOT", "x-feline-pathname": "/album" },
    })
  );
  expect(response.headers.get("x-middleware-request-x-feline-pathname")).toBe("/blog");
  expect(response.headers.get("x-middleware-request-x-user-role")).toBeNull();
});
