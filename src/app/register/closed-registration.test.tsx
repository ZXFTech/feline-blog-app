import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, authUnavailable: false, logout: vi.fn() }) }));
import Register from "./page";
import Onboarding from "../auth/user-center/onboarding/page";
import { UserMenu } from "@/components/Profile/UserMenu";

describe("closed blog registration surfaces", () => {
  it.each([Register, Onboarding])("shows a closed entry without a registration or creation form", Page => {
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { name: "博客注册暂未开放" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute("href", "/login");
    expect(container.querySelector("form")).toBeNull();
  });
  it("offers existing account login without advertising registration", () => {
    render(<UserMenu />);
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("登录/注册")).not.toBeInTheDocument();
  });
});
