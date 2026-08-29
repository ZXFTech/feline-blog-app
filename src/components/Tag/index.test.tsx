import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Tag from ".";

describe("Tag", () => {
  it("renders a static tag as one non-interactive surface", () => {
    render(<Tag containerProps={{ "aria-label": "状态标签" }}>已完成</Tag>);

    const tag = screen.getByLabelText("状态标签");
    expect(tag.tagName).toBe("SPAN");
    expect(tag).toHaveClass("neu-div", "neu-embossed-sm");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a selectable tag as a native button", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Tag onSelect={onSelect}>候选标签</Tag>);

    const button = screen.getByRole("button", { name: "候选标签" });
    expect(button).toHaveClass("neu-div", "neu-embossed-sm");
    await user.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("uses a dedicated close button with a derived label", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Tag onClose={onClose}>工作</Tag>);

    await user.click(screen.getByRole("button", { name: "移除工作" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps select and close actions separate inside one surface", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Tag onSelect={onSelect} onClose={onClose}>
        重要
      </Tag>,
    );

    const selectButton = screen.getByRole("button", { name: "重要" });
    const closeButton = screen.getByRole("button", { name: "移除重要" });
    expect(selectButton.closest(".neu-div")).toBe(
      closeButton.closest(".neu-div"),
    );

    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(selectButton);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("requires an explicit close label for non-text children", () => {
    expect(() =>
      render(
        <Tag onClose={vi.fn()}>
          <strong>复杂标签</strong>
        </Tag>,
      ),
    ).toThrow("requires closeLabel");
  });

  it("uses an explicit close label for non-text children", () => {
    render(
      <Tag onClose={vi.fn()} closeLabel="移除复杂标签">
        <strong>复杂标签</strong>
      </Tag>,
    );

    expect(screen.getByRole("button", { name: "移除复杂标签" })).toBeVisible();
  });

  it("supports native keyboard activation for select and close actions", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Tag onSelect={onSelect} onClose={onClose}>
        键盘标签
      </Tag>,
    );

    screen.getByRole("button", { name: "键盘标签" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "移除键盘标签" }).focus();
    await user.keyboard(" ");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("keeps one shared surface around combined actions", () => {
    const { container } = render(
      <Tag onSelect={vi.fn()} onClose={vi.fn()}>
        组合标签
      </Tag>,
    );

    expect(container.querySelectorAll(".neu-div")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "组合标签" })).not.toHaveClass(
      "neu-div",
    );
    expect(
      screen.getByRole("button", { name: "移除组合标签" }),
    ).not.toHaveClass("neu-div");
  });
});
