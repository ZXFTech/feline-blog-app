// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertIsolatedE2eEnvironment } from "./prepare-e2e";

const isolated = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  C06_COMPLETE_E2E: "true",
  C06_ADMIN_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/feline_blog_dev",
  STAGING_SMOKE_ORIGIN: "https://feline-blog-staging-3ec51f95bf630efc-2918s-projects.vercel.app",
};

describe("C-06 disposable database guard", () => {
  it("accepts the Actions-owned loopback test database", () => {
    expect(assertIsolatedE2eEnvironment(isolated).hostname).toBe("127.0.0.1");
  });

  it.each(["CI", "GITHUB_ACTIONS", "C06_COMPLETE_E2E"])(
    "rejects seeding outside the explicit Actions context when %s is absent",
    (name) => {
      expect(() => assertIsolatedE2eEnvironment({ ...isolated, [name]: undefined })).toThrow();
    }
  );

  it.each([
    "postgresql://postgres@remote.example.test:5432/feline_blog_dev",
    "postgresql://postgres@127.0.0.1:54329/feline_blog_dev",
    "postgresql://postgres@127.0.0.1:5432/ordinary_data",
    "postgresql://app_runtime@127.0.0.1:5432/feline_blog_dev",
    "postgresql://postgres@127.0.0.1:5432/feline_blog_dev?host=remote.example.test",
  ])("rejects a database outside the disposable target: %s", (url) => {
    expect(() =>
      assertIsolatedE2eEnvironment({ ...isolated, C06_ADMIN_DATABASE_URL: url })
    ).toThrow();
  });

  it("rejects forwarding OIDC to an arbitrary origin", () => {
    expect(() =>
      assertIsolatedE2eEnvironment({
        ...isolated,
        STAGING_SMOKE_ORIGIN: "https://unrelated.example.test",
      })
    ).toThrow();
  });
});
