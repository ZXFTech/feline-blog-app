import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ShellDemo from "@/app/album/_components/demos/ShellDemo";

vi.mock("@/components/Navbar", () => ({
  default: () => <nav data-testid="navbar-preview">导航</nav>,
}));
vi.mock("@/components/Footer", () => ({
  default: () => <footer data-testid="footer-preview">页脚</footer>,
}));

describe("ShellDemo", () => {
  it("uses real Content regions and switches between the supported compositions", async () => {
    const user = userEvent.setup();
    const { container } = render(<ShellDemo />);

    expect(screen.getByTestId("navbar-preview")).toBeInTheDocument();
    expect(screen.getByTestId("footer-preview")).toBeInTheDocument();
    expect(screen.getByText("页面信息")).toBeInTheDocument();
    expect(screen.getByText("页面操作")).toBeInTheDocument();
    expect(container.querySelector(".content-container")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "仅主区" }));

    expect(screen.queryByText("页面信息")).not.toBeInTheDocument();
    expect(screen.queryByText("页面操作")).not.toBeInTheDocument();
    expect(screen.getByText("页面主区")).toBeInTheDocument();
  });

  it("keeps the compact theme representative free of Content ids", () => {
    const { container } = render(<ShellDemo compact />);

    expect(screen.getByTestId("compact-shell-viewport")).toBeInTheDocument();
    expect(container.querySelector("#content")).not.toBeInTheDocument();
  });
});
