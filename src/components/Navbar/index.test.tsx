import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Navbar from ".";

vi.mock("../Theme", () => ({ default: () => null }));
vi.mock("../Profile/UserMenu", () => ({ UserMenu: () => null }));
vi.mock("../Icon/presetIcon", () => ({ IconNeonCat: () => null }));

describe("Navbar", () => {
  it("puts the raise interaction on native navigation links", () => {
    render(<Navbar routeList={["home", "blog"]} />);

    const home = screen.getByRole("link", { name: "HOME" });
    const blog = screen.getByRole("link", { name: "BLOG" });
    expect(home).toHaveAttribute("href", "/");
    expect(blog).toHaveAttribute("href", "/blog");
    expect(home).toHaveClass("neu-interaction-raise-normal");
    expect(blog).toHaveClass("neu-interaction-raise-normal");
    expect(home.parentElement?.tagName).toBe("LI");
    expect(home.parentElement).not.toHaveAttribute("role", "button");
  });
});
