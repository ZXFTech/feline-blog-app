// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
describe("0003 private authentication response policy", () => {
  it.each(["/login", "/register", "/profile", "/auth/user-center/confirm", "/api/auth/me"])("AC-16 AC-19 marks %s private and strips client identity headers", path => {
    const result = proxy(new NextRequest("https://blog.zhaosie.com" + path, { headers: { "x-user-id": "forged", "x-user-role": "ROOT" } }));
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(result.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(result.headers.get("x-middleware-request-x-user-id")).toBeNull();
    expect(result.headers.get("x-middleware-request-x-user-role")).toBeNull();
  });
});
