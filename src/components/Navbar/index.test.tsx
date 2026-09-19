import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Navbar from ".";

vi.mock("@/components/theme-switcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/album" }));
vi.mock("../Profile/UserMenu", () => ({
  UserMenu: ({ prefetch }: { prefetch?: boolean }) => (
    <span data-testid="user-menu-prefetch">{String(prefetch)}</span>
  ),
}));
vi.mock("../Icon/presetIcon", () => ({
  IconNeonCat: ({ prefetch }: { prefetch?: boolean }) => (
    <span data-testid="cat-prefetch">{String(prefetch)}</span>
  ),
}));
vi.mock("../pomodoro/PomodoroGlobalStatus", () => ({
  default: ({ prefetch }: { prefetch?: boolean }) => (
    <span data-testid="pomodoro-prefetch">{String(prefetch)}</span>
  ),
}));

describe("Navbar", () => {
  it("keeps native navigation links inside a contained responsive bar", () => {
    const { container } = render(<Navbar routeList={["home", "blog"]} />);

    const home = screen.getByRole("link", { name: "HOME" });
    const blog = screen.getByRole("link", { name: "BLOG" });
    expect(home).toHaveAttribute("href", "/");
    expect(blog).toHaveAttribute("href", "/blog");
    expect(screen.getByTestId("cat-prefetch")).toHaveTextContent("false");
    expect(screen.getByTestId("pomodoro-prefetch")).toHaveTextContent("false");
    expect(screen.getByTestId("user-menu-prefetch")).toHaveTextContent("false");
    expect(home).toHaveClass("bg-background", "shadow-none");
    expect(blog).toHaveClass("bg-background", "shadow-none");
    expect(home.parentElement?.tagName).toBe("LI");
    expect(home.parentElement).not.toHaveAttribute("role", "button");
    expect(container.querySelector(".navbar")).toHaveClass(
      "overflow-x-auto",
      "no-scrollbar",
      "p-[var(--spacing-panel-inset-compact)]",
      "gap-[var(--spacing-panel-gap-compact)]"
    );
  });
});
