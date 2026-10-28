// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authTestEnv, integrationTestEnv } from "@/test/auth-center";
const mocks = vi.hoisted(() => ({ checkUser: vi.fn(), createUser: vi.fn(), query: vi.fn() }));
vi.mock("@/db/userAction", () => ({ checkUser: mocks.checkUser }));
vi.mock("@/db/postgres/runtime", () => ({ postgresPool: { query: mocks.query } }));
vi.mock("@/db/client", () => ({ default: { user: { create: mocks.createUser } } }));
import { POST as register } from "./register/route";
import { POST as login } from "./login/route";
import { GET as csrf } from "./csrf/route";
import { csrfToken } from "@/lib/auth/center/flows";
import { sameOrigin } from "@/lib/auth/center/http";
import { cookieNames } from "@/lib/auth/center/store";
const browser = {
  id: "91fabba8-712e-49b8-b9fa-5ea3a76bd269",
  epoch: 0,
  current_flow_id: null,
  require_fresh_auth: false,
  last_logout_at: null,
  expires_at: new Date(Date.now() + 600000),
};
function request(path: string, body: object | string, origin = authTestEnv.FELINE_PUBLIC_ORIGIN) {
  const names = cookieNames();
  return new NextRequest(`${authTestEnv.FELINE_PUBLIC_ORIGIN}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: `${names.browser}=${"b".repeat(43)}; ${names.csrf}=nonce-a`,
    },
    body:
      typeof body === "string"
        ? body
        : JSON.stringify({ ...body, csrfToken: csrfToken(browser, "nonce-a") }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(authTestEnv)) vi.stubEnv(key, value);
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("feline_auth_rate") ? [{ count: 1, retry: 60 }] : [browser],
  }));
});
afterEach(() => vi.unstubAllEnvs());
describe("0003 migrated authentication routes", () => {
  it("AC-19 limits anonymous CSRF initialization before creating a browser row", async () => {
    let attempts = 0;
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("feline_auth_rate") ? [{ count: ++attempts, retry: 37 }] : [browser],
    }));
    const responses = [];
    for (let i = 0; i < 21; i++)
      responses.push(
        await csrf(new NextRequest(`${authTestEnv.FELINE_PUBLIC_ORIGIN}/api/auth/csrf`))
      );
    expect(responses.map((response) => response.status)).toEqual([...Array(20).fill(200), 429]);
    expect(responses[20].headers.get("Retry-After")).toBe("37");
    expect((await responses[20].json()).code).toBe("RATE_LIMITED");
    expect(
      mocks.query.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO public.feline_auth_browser")
      )
    ).toHaveLength(20);
  });
  it("AC-19 fails closed when CSRF rate storage is unavailable", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("feline_auth_rate")) throw new Error("private-database-detail");
      return { rows: [browser] };
    });
    const response = await csrf(
      new NextRequest(`${authTestEnv.FELINE_PUBLIC_ORIGIN}/api/auth/csrf`)
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-database-detail");
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("feline_auth_browser"))).toBe(false);
  });
  it("AC-16 sets private production CSRF cookies and disables caching", async () => {
    for (const [key, value] of Object.entries(integrationTestEnv)) vi.stubEnv(key, value);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FELINE_PUBLIC_ORIGIN", "https://blog.zhaosie.com");
    vi.stubEnv("USER_CENTER_ISSUER", "https://auth.zhaosie.com/api/auth");
    const response = await csrf(
      new NextRequest("https://blog.zhaosie.com/api/auth/csrf", {
        headers: {
          Origin: "https://blog.zhaosie.com",
          Cookie: `__Host-feline-browser=${"b".repeat(43)}`,
        },
      })
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    for (const value of ["__Host-feline-csrf=", "HttpOnly", "Secure", "SameSite=lax", "Path=/"])
      expect(cookie).toContain(value);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("uses the fixed staging origin with secure host cookies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("FELINE_PUBLIC_ORIGIN", "https://staging-blog.example.com");
    vi.stubEnv("USER_CENTER_ISSUER", "https://auth.zhaosie.com/api/auth");
    const response = await csrf(
      new NextRequest("https://staging-blog.example.com/api/auth/csrf", {
        headers: { Origin: "https://staging-blog.example.com" },
      })
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    for (const value of ["__Host-feline-csrf=", "HttpOnly", "Secure", "SameSite=lax", "Path=/"])
      expect(cookie).toContain(value);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(() =>
      sameOrigin(new Headers({ Origin: "https://staging-blog.example.com" }), true)
    ).not.toThrow();
    for (const origin of ["https://blog.zhaosie.com", "https://candidate.vercel.app"]) {
      expect(() => sameOrigin(new Headers({ Origin: origin }), true)).toThrow("ORIGIN_REJECTED");
    }
    expect(() =>
      sameOrigin(
        new Headers({ Origin: "https://staging-blog.example.com", "sec-fetch-site": "cross-site" }),
        true
      )
    ).toThrow("ORIGIN_REJECTED");
  });
  it("accepts a staging login POST through origin and CSRF checks", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("FELINE_PUBLIC_ORIGIN", "https://staging-blog.example.com");
    vi.stubEnv("USER_CENTER_ISSUER", "https://auth.zhaosie.com/api/auth");
    mocks.checkUser.mockResolvedValue(null);
    const names = cookieNames();
    const response = await login(
      new NextRequest("https://staging-blog.example.com/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://staging-blog.example.com",
          Cookie: `${names.browser}=${"b".repeat(43)}; ${names.csrf}=nonce-a`,
        },
        body: JSON.stringify({
          email: "unknown@example.com",
          password: "synthetic-test-password",
          csrfToken: csrfToken(browser, "nonce-a"),
        }),
      })
    );
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("INVALID_CREDENTIALS");
    expect(mocks.checkUser).toHaveBeenCalledWith("email", "unknown@example.com", true);
  });
  it.each([
    { email: "not-an-email" },
    { email: "new@example.com", username: "new", password: "private-test-password" },
    { email: " NEW@EXAMPLE.COM " },
  ])("AC-3 rejects local registration without any user write", async (input) => {
    const response = await register(request("register", input));
    expect(response.status).toBe(409);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.checkUser).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private-test-password");
  });
  it("AC-19 returns an equivalent safe login failure for an unknown email", async () => {
    mocks.checkUser.mockResolvedValue(null);
    const response = await login(
      request("login", { email: "missing@example.com", password: "Password1" })
    );
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("INVALID_CREDENTIALS");
  });
  it("AC-16 rejects malformed JSON before querying identity", async () => {
    const response = await login(request("login", "{invalid"));
    expect(response.status).toBe(400);
    expect(mocks.checkUser).not.toHaveBeenCalled();
  });
  it("AC-16 rejects a sibling origin even for the closed registration endpoint", async () => {
    const response = await register(request("register", {}, "http://sibling.invalid"));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
