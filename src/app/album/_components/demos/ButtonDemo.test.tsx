import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import ButtonDemo from "@/app/album/_components/demos/ButtonDemo";

describe("ButtonDemo", () => {
  it("covers: AC-6 and AC-7, exposes the real button and link families", () => {
    render(<ButtonDemo />);

    expect(screen.getByRole("heading", { name: "1. 按钮 Button" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "2. 按钮组与链接 ButtonGroup / StyledLink" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "加载中" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "链接形态" })).toHaveAttribute(
      "href",
      "/album?component=button"
    );
  });

  it("covers: AC-8 and AC-9, keeps the compact representative interactive and local", async () => {
    const user = userEvent.setup();
    render(<ButtonDemo compact />);

    const action = screen.getByRole("button", { name: "主要操作" });
    expect(screen.getByText("点击 0 次")).toBeVisible();
    await user.click(action);
    expect(screen.getByText("点击 1 次")).toBeVisible();
    expect(screen.getByRole("group", { name: "主题代表按钮组" })).toBeVisible();
  });
});
