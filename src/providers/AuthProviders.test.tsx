import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthProviders, { useCtxAuth, type CtxUser } from "./AuthProviders";

const signedInUser: CtxUser = {
  id: "user-1",
  username: "猫猫",
  email: "cat@example.com",
  role: "USER",
  avatar: null,
};

function CurrentUser() {
  const { user } = useCtxAuth();
  return <output>{user ? `${user.id}:${user.email}` : "未登录"}</output>;
}

describe("AuthProviders", () => {
  it("covers: AC-7, shows the server restored user on the first render", () => {
    render(
      <AuthProviders initialUser={signedInUser}>
        <CurrentUser />
      </AuthProviders>,
    );
    expect(screen.getByText("user-1:cat@example.com")).toBeInTheDocument();
  });

  it("covers: AC-7, keeps anonymous requests unauthenticated", () => {
    render(
      <AuthProviders initialUser={null}>
        <CurrentUser />
      </AuthProviders>,
    );
    expect(screen.getByText("未登录")).toBeInTheDocument();
  });
});
