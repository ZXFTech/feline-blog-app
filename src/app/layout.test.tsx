import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  account: vi.fn(),
  ready: vi.fn(),
  pathname: "/",
  authProvider: vi.fn(
    ({ children }: { children: React.ReactNode; initialUser: unknown }) => children
  ),
  pomodoroProvider: vi.fn(({ children }: { children: React.ReactNode }) => children),
}));

vi.mock("@/lib/auth/userAuth", () => ({
  resolveAccountUser: mocks.account,
}));
vi.mock("@/lib/auth/sdk/config", () => ({ getSdkConfiguration: () => ({ publicConfig: null }) }));
vi.mock("@/lib/auth/sdk/business", () => ({ assertBusinessReady: mocks.ready }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-feline-pathname": mocks.pathname }),
}));
vi.mock("@/providers/AuthProviders", () => ({ default: mocks.authProvider }));
vi.mock("@/providers/PomodoroProvider", () => ({
  PomodoroProvider: mocks.pomodoroProvider,
}));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
  Inter: () => ({ variable: "inter" }),
  Ma_Shan_Zheng: () => ({ variable: "ma-shan-zheng" }),
}));
vi.mock("next/head", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/ProMessage", () => ({ Toaster: () => null }));

import RootLayout from "./layout";

describe("RootLayout authentication hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    mocks.ready.mockResolvedValue(undefined);
    mocks.account.mockImplementation(async () => {
      const user = await mocks.getCurrentUser();
      return user ? { status: "success", data: user } : { status: "unauthenticated" };
    });
  });

  it("covers: Album AC-1, skips authentication restoration on the public showcase", async () => {
    mocks.pathname = "/album";

    renderToStaticMarkup(await RootLayout({ children: <main>组件展示</main> }));

    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.authProvider).toHaveBeenCalledWith(
      expect.objectContaining({ initialUser: null }),
      undefined
    );
  });

  it("AC-1 mounts one global pomodoro provider inside the authenticated layout", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    renderToStaticMarkup(await RootLayout({ children: <main>页面内容</main> }));

    expect(mocks.authProvider).toHaveBeenCalledOnce();
    expect(mocks.pomodoroProvider).toHaveBeenCalledOnce();
  });

  it("covers: AC-7, passes only safe restored user fields to the client provider", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      username: "猫猫",
      email: "cat@example.com",
      role: "USER",
      authMode: "sdk",
      avatar: null,
      password: "must-not-reach-the-client",
      phone: "13800000000",
      createdAt: new Date(),
    });

    renderToStaticMarkup(await RootLayout({ children: <main>番茄钟</main> }));

    expect(mocks.authProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        initialUser: {
          id: "user-1",
          username: "猫猫",
          email: "cat@example.com",
          role: "USER",
          avatar: null,
          authMode: "sdk",
        },
      }),
      undefined
    );
    const providerProps = mocks.authProvider.mock.calls[0]?.[0];
    expect(providerProps.initialUser).not.toHaveProperty("password");
    expect(providerProps.initialUser).not.toHaveProperty("phone");
  });

  it("covers: AC-7, passes an anonymous state when no cookie user exists", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    renderToStaticMarkup(await RootLayout({ children: <main>番茄钟</main> }));
    expect(mocks.authProvider).toHaveBeenCalledWith(
      expect.objectContaining({ initialUser: null }),
      undefined
    );
  });

  it("places theme restoration before the application content", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await RootLayout({ children: <main>页面内容</main> }));
    const themeScriptIndex = markup.indexOf("donmiss-theme");
    const contentIndex = markup.indexOf("<main>页面内容</main>");

    expect(themeScriptIndex).toBeGreaterThan(-1);
    expect(themeScriptIndex).toBeLessThan(contentIndex);
    expect(markup).toContain('<html lang="zh-cn">');
  });
});
