import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthProviders, { useCtxAuth, type CtxUser } from "./AuthProviders";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const signedInUser: CtxUser = {
  id: "user-1",
  username: "猫猫",
  email: "cat@example.com",
  role: "USER",
  avatar: null,
};

function CurrentUser() {
  const { authEnabled, user } = useCtxAuth();
  return (
    <output>
      {authEnabled ? "认证启用" : "认证停用"}:{user ? `${user.id}:${user.email}` : "未登录"}
    </output>
  );
}

describe("AuthProviders", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it("covers: AC-7, shows the server restored user on the first render", () => {
    render(
      <AuthProviders initialUser={signedInUser}>
        <CurrentUser />
      </AuthProviders>
    );
    expect(screen.getByText("认证启用:user-1:cat@example.com")).toBeInTheDocument();
  });

  it("covers: AC-7, keeps anonymous requests unauthenticated", () => {
    render(
      <AuthProviders initialUser={null}>
        <CurrentUser />
      </AuthProviders>
    );
    expect(screen.getByText("认证启用:未登录")).toBeInTheDocument();
  });

  it("covers: Album AC-1, hides a restored user from the public showcase", () => {
    navigation.pathname = "/album";
    render(
      <AuthProviders initialUser={signedInUser}>
        <CurrentUser />
      </AuthProviders>
    );
    expect(screen.getByText("认证停用:未登录")).toBeInTheDocument();
  });

  it("covers: Album AC-1, restores the in-memory session after leaving Album", () => {
    navigation.pathname = "/album";
    const { rerender } = render(
      <AuthProviders initialUser={signedInUser}>
        <CurrentUser />
      </AuthProviders>
    );
    expect(screen.getByText("认证停用:未登录")).toBeInTheDocument();

    navigation.pathname = "/todo";
    rerender(
      <AuthProviders initialUser={signedInUser}>
        <CurrentUser />
      </AuthProviders>
    );

    expect(screen.getByText("认证启用:user-1:cat@example.com")).toBeInTheDocument();
  });
});
