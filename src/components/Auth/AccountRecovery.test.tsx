// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { describeIntegration } from "@user-center/next-better-auth/config";

const mocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  principal: vi.fn(),
  stage: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw Error("UNEXPECTED_REDIRECT");
  },
  unstable_rethrow: () => {},
}));
vi.mock("@/lib/auth/sdk/config", () => ({ getSdkConfiguration: mocks.configuration }));
vi.mock("@/lib/auth/sdk/server", () => ({
  getSdkIntegration: () => ({ getPrincipal: mocks.principal }),
}));
vi.mock("@/lib/auth/sdk/business", () => ({
  assertProfileStage: mocks.stage,
  readInstallation: vi.fn(),
  assertProfileAllowed: vi.fn(),
  SdkHostError: class extends Error {},
}));
vi.mock("@/components/Auth/AuthFrame", () => ({
  AuthFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/Auth/SdkAuth", () => ({
  SdkControls: ({ mode }: { mode: string }) =>
    mode === "logout" ? <button>退出当前平台</button> : null,
}));
vi.mock("@/components/Auth/ProfileSetupForm", () => ({
  ProfileSetupForm: () => <form aria-label="完成博客资料" />,
}));
import Setup from "@/app/auth/setup/page";
import Profile from "@/app/profile/page";

beforeEach(() => {
  vi.resetAllMocks();
  const manifest = {
    schemaVersion: 1,
    issuer: "https://center.example.test/api/auth",
    platformOrigin: "https://blog.example.test",
    clientId: "test-client",
    clientSecretEnv: "CLIENT_SECRET",
    sessionSecretEnv: "SESSION_SECRET",
    authBasePath: "/api/auth",
    errorPath: "/auth/error",
    returnTo: {
      fallback: "/profile",
      allowedPaths: ["/profile"],
      allowedPathPrefixes: [],
      allowedQueryKeys: [],
    },
  };
  mocks.configuration.mockReturnValue({ manifest, publicConfig: describeIntegration(manifest) });
  mocks.principal.mockRejectedValue(Error("CENTER_UNAVAILABLE"));
});

const pages = [
  { name: "setup", render: () => Setup({ searchParams: Promise.resolve({}) }) },
  { name: "profile", render: () => Profile() },
];
it.each(pages)(
  "keeps signout reachable when $name identity verification fails",
  async ({ render }) => {
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("退出当前平台");
    expect(html).toContain('role="alert"');
  }
);
it.each(pages)(
  "does not offer a nonfunctional signout on $name without configuration",
  async ({ render }) => {
    mocks.configuration.mockImplementation(() => {
      throw Error("ENVIRONMENT_MISMATCH");
    });
    const html = renderToStaticMarkup(await render());
    expect(html).not.toContain("退出当前平台");
  }
);
it("lets an unmapped user sign out while completing their profile", async () => {
  mocks.principal.mockResolvedValue({
    status: "mapping-required",
    identity: { profile: { email: "reader@example.test" } },
  });
  mocks.stage.mockResolvedValue(undefined);
  const html = renderToStaticMarkup(await Setup({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("完成博客资料");
  expect(html).toContain("退出当前平台");
});
it("keeps signout reachable when an unmapped user is blocked by initialization", async () => {
  mocks.principal.mockResolvedValue({
    status: "mapping-required",
    identity: { profile: { email: "reader@example.test" } },
  });
  mocks.stage.mockRejectedValue(Error("INITIALIZATION_PENDING"));
  const html = renderToStaticMarkup(await Setup({ searchParams: Promise.resolve({}) }));
  expect(html).not.toContain("<form");
  expect(html).toContain("退出当前平台");
});
