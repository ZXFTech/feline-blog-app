import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Navbar from ".";

vi.mock("@/components/theme-switcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("../Profile/UserMenu", () => ({ UserMenu: () => null }));
vi.mock("../Icon/presetIcon", () => ({ IconNeonCat: () => null }));
vi.mock("../pomodoro/PomodoroGlobalStatus", () => ({ default: () => null }));

describe("Navbar", () => {
  it("keeps native navigation links inside a contained responsive bar", () => {
    const { container } = render(<Navbar routeList={["home", "blog"]} />);

    const home = screen.getByRole("link", { name: "HOME" });
    const blog = screen.getByRole("link", { name: "BLOG" });
    expect(home).toHaveAttribute("href", "/");
    expect(blog).toHaveAttribute("href", "/blog");
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
