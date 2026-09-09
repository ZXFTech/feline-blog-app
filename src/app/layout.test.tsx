import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  authProvider: vi.fn(
    ({ children }: { children: React.ReactNode; initialUser: unknown }) => children
  ),
  pomodoroProvider: vi.fn(({ children }: { children: React.ReactNode }) => children),
}));

vi.mock("@/lib/auth/userAuth", () => ({
  getCurrentUser: mocks.getCurrentUser,
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
  beforeEach(() => vi.clearAllMocks());

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
    const themeScriptIndex = markup.indexOf("feline-blog-theme");
    const contentIndex = markup.indexOf("<main>页面内容</main>");

    expect(themeScriptIndex).toBeGreaterThan(-1);
    expect(themeScriptIndex).toBeLessThan(contentIndex);
    expect(markup).toContain('<html lang="zh-cn">');
  });
});
