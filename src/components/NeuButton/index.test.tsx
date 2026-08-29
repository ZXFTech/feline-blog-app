import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import NeuButton from ".";

describe("NeuButton", () => {
  it("renders actions as buttons and forwards native button attributes", () => {
    const ref = createRef<HTMLButtonElement>();

    render(
      <NeuButton ref={ref} type="submit" disabled data-state="ready">
        保存
      </NeuButton>,
    );

    const button = screen.getByRole("button", { name: "保存" });
    expect(button).toBe(ref.current);
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("data-state", "ready");
    expect(button).toBeDisabled();
  });

  it("renders navigation as a link without nesting interactive elements", () => {
    const ref = createRef<HTMLAnchorElement>();

    render(
      <NeuButton ref={ref} buttonType="link" href="/login" target="_blank">
        登录
      </NeuButton>,
    );

    const link = screen.getByRole("link", { name: "登录" });
    expect(link).toBe(ref.current);
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.querySelector("button")).not.toBeInTheDocument();
  });

  it("calls a link click handler once", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <NeuButton buttonType="link" href="#target" onClick={onClick}>
        前往
      </NeuButton>,
    );

    await user.click(screen.getByRole("link", { name: "前往" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps the existing surface, size, loading, and icon classes", () => {
    render(
      <NeuButton
        buttonType="link"
        href="/login"
        neuType="elevated"
        intensity="sm"
        btnSize="lg"
        icon="search"
        loading
      >
        登录
      </NeuButton>,
    );

    expect(screen.getByRole("link", { name: /登录/ })).toHaveClass(
      "btn",
      "btn-lg",
      "loading",
      "neu-btn",
      "btn-elevated-sm",
      "neu-btn-link",
    );
  });
});

if (false) {
  // @ts-expect-error Link variants require a destination.
  <NeuButton buttonType="link">缺少地址</NeuButton>;
  // @ts-expect-error Action variants cannot receive a link destination.
  <NeuButton href="/login">错误按钮</NeuButton>;
  // @ts-expect-error Links do not support the native disabled attribute.
  <NeuButton buttonType="link" href="/login" disabled>
    错误链接
  </NeuButton>;
}
