// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("complete E2E environment routing", () => {
  it("runs staging smoke against the supplied remote origin", async () => {
    vi.stubEnv("STAGING_SMOKE_ORIGIN", "https://stage.example.test");
    vi.resetModules();
    const { default: config } = await import("../../playwright.config");
    const remote = config.projects?.filter((project) => project.name?.startsWith("staging-"));
    expect(remote).toHaveLength(2);
    for (const project of remote ?? []) {
      expect(project.use?.baseURL).toBe("https://stage.example.test");
      expect(project.testMatch).toBeInstanceOf(RegExp);
      expect((project.testMatch as RegExp).test("e2e/staging-smoke.spec.ts")).toBe(true);
      expect((project.testMatch as RegExp).test("e2e/blog-status.spec.ts")).toBe(false);
    }
  });

  it("keeps local database scenarios out of the remote projects", async () => {
    const { default: config } = await import("../../playwright.config");
    const local = config.projects?.filter((project) => !project.name?.startsWith("staging-"));
    expect(local?.map((project) => project.name)).toEqual(["desktop", "mobile"]);
    for (const project of local ?? []) {
      expect(project.testIgnore).toBeInstanceOf(RegExp);
      expect((project.testIgnore as RegExp).test("e2e/staging-smoke.spec.ts")).toBe(true);
      expect((project.testIgnore as RegExp).test("e2e/blog-status.spec.ts")).toBe(false);
    }
  });

  it("does not retain OIDC-bearing remote browser media", async () => {
    const { default: config } = await import("../../playwright.config");
    const remote = config.projects?.filter((project) => project.name?.startsWith("staging-"));
    expect(remote).toHaveLength(2);
    for (const project of remote ?? []) {
      expect(project.use).toMatchObject({
        serviceWorkers: "block",
        trace: "off",
        screenshot: "off",
        video: "off",
      });
    }
  });
});
