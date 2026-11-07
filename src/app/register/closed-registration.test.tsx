import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Register from "@/app/register/page";
it("routes new readers to center authentication without a local password form", () => {
  render(<Register />);
  expect(screen.getByRole("link", { name: "前往登录" })).toHaveAttribute("href", "/login");
  expect(screen.queryByLabelText(/密码/)).toBeNull();
});
