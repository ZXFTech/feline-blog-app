import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("forwards its ref and native button attributes", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit" disabled>
        保存
      </Button>
    );
    expect(screen.getByRole("button", { name: "保存" })).toBe(ref.current);
    expect(ref.current).toBeDisabled();
    expect(ref.current).toHaveAttribute("type", "submit");
  });

  it("blocks clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        保存
      </Button>
    );
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps semantic text colors when a size variant is applied", () => {
    render(
      <Button variant="danger" size="md">
        删除
      </Button>
    );

    expect(screen.getByRole("button", { name: "删除" })).toHaveClass("text-status-error-fg");
  });

  it("covers: AC-5 activates once from Enter and Space", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>执行</Button>);
    const button = screen.getByRole("button", { name: "执行" });

    button.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
