import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ColorPanel from "@/components/ColorPanel";

describe("tag color keyboard operation", () => {
  it("opens a named color picker and selects a real color with the keyboard", async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    render(<ColorPanel color="" onColorPicked={picked} />);
    await user.click(screen.getByRole("button", { name: "选择标签颜色" }));
    const swatch = screen.getByRole("button", { name: "选择 blue-500 颜色" });
    swatch.focus();
    await user.keyboard("{Enter}");
    expect(picked).toHaveBeenCalledWith(expect.any(String));
    expect(picked.mock.calls.at(-1)?.[0]).not.toBe("");
    expect(screen.queryAllByRole("button", { name: /^选择 .+ 颜色$/ })).toHaveLength(0);
  }, 15_000);
});
