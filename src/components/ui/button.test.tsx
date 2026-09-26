import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
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

  it("uses the restrained default hover highlight", () => {
    render(<Button>默认</Button>);

    expect(screen.getByRole("button", { name: "默认" })).toHaveClass(
      "hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]"
    );
  });

  it("renders a linked non-native button without Base UI errors", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <Button nativeButton={false} render={<Link href="/checklists" />}>
        返回清单
      </Button>
    );

    expect(screen.getByRole("button", { name: "返回清单" })).toHaveAttribute("href", "/checklists");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ["primary", "hover:bg-[color-mix(in_oklch,var(--primary),white_10%)]"],
    ["danger", "hover:bg-[color-mix(in_oklch,var(--status-error),white_10%)]"],
    ["warning", "hover:bg-[color-mix(in_oklch,var(--status-warning),white_10%)]"],
    ["success", "hover:bg-[color-mix(in_oklch,var(--status-success),white_10%)]"],
  ] as const)("mixes 10%% white into the %s hover color", (variant, expectedClass) => {
    render(<Button variant={variant}>{variant}</Button>);

    expect(screen.getByRole("button", { name: variant })).toHaveClass(expectedClass);
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
