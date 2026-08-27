import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  authProvider: vi.fn(
    ({ children }: { children: React.ReactNode; initialUser: unknown }) =>
      children,
  ),
}));

vi.mock("@/lib/auth/userAuth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/providers/AuthProviders", () => ({ default: mocks.authProvider }));
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
      undefined,
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
      undefined,
    );
  });
});
