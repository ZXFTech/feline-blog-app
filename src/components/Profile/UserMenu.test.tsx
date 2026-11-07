import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

const { logout, retry, useAuth } = vi.hoisted(() => ({
  logout: vi.fn(),
  retry: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth,
}));

describe("UserMenu", () => {
  beforeEach(() => {
    logout.mockReset();
    retry.mockReset();
    useAuth.mockReset();
  });

  it("exits the current user when the username button is clicked", async () => {
    useAuth.mockReturnValue({ logout, user: { username: "猫猫" } });
    const user = userEvent.setup();

    render(<UserMenu />);
    await user.click(screen.getByRole("button", { name: /猫猫/ }));

    expect(logout).toHaveBeenCalledOnce();
  });

  it("shows the login link when there is no current user", () => {
    useAuth.mockReturnValue({ logout, user: null });

    render(<UserMenu />);

    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
  });

  it("does not claim a signed out state or expose account data on the public showcase", () => {
    useAuth.mockReturnValue({
      authEnabled: false,
      logout,
      user: { username: "private account name" },
      authUnavailable: true,
    });
    render(<UserMenu />);
    expect(screen.getByRole("link", { name: "账号与安全" })).toHaveAttribute("href", "/profile");
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
    expect(screen.queryByText("private account name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers actual retry and logout actions during an identity outage", async () => {
    useAuth.mockReturnValue({ logout, retry, user: null, authUnavailable: true, canSignOut: true });
    render(<UserMenu />);
    await userEvent.click(screen.getByRole("button", { name: "重新核验" }));
    expect(retry).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "退出当前平台" }));
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "重试或本地退出" })).not.toBeInTheDocument();
  });

  it("does not claim logout success or retry signout when confirmation fails", async () => {
    logout.mockRejectedValue(Error("SIGN_OUT_UNCONFIRMED"));
    useAuth.mockReturnValue({ logout, retry, user: null, authUnavailable: true, canSignOut: true });
    render(<UserMenu />);
    await userEvent.click(screen.getByRole("button", { name: "退出当前平台" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("退出尚未确认");
    expect(logout).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "重新核验" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });

  it("does not offer signout when its public configuration is unavailable", () => {
    useAuth.mockReturnValue({
      logout,
      retry,
      user: null,
      authUnavailable: true,
      canSignOut: false,
    });
    render(<UserMenu />);
    expect(screen.getByRole("alert")).toHaveTextContent("认证配置暂时不可用");
    expect(screen.queryByRole("button", { name: "退出当前平台" })).not.toBeInTheDocument();
  });
});
