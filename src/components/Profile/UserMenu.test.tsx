import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

const { logout, useAuth } = vi.hoisted(() => ({
  logout: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth,
}));

describe("UserMenu", () => {
  beforeEach(() => {
    logout.mockReset();
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

    expect(screen.getByRole("link", { name: "登录/注册" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
