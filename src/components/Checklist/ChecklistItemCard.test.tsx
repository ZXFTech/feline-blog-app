import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChecklistItemCard } from "@/components/Checklist/ChecklistItemCard";
import type { ChecklistItem } from "@/lib/checklist";

const item: ChecklistItem = {
  id: "item-1",
  label: "回归测试",
  detail: "覆盖主要流程",
  done: false,
};

describe("ChecklistItemCard", () => {
  afterEach(() => vi.useRealTimers());

  it("throttles short-press toggles and keeps the detail action isolated", () => {
    const onToggle = vi.fn();
    const onOpenDetail = vi.fn();
    render(<ChecklistItemCard item={item} onToggle={onToggle} onOpenDetail={onOpenDetail} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "查看清单项详情" }));
    expect(onOpenDetail).toHaveBeenCalledWith(item);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("opens detail on release after a 500ms hold and does not toggle", () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    const onOpenDetail = vi.fn();
    render(<ChecklistItemCard item={item} onToggle={onToggle} onOpenDetail={onOpenDetail} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    fireEvent.pointerDown(toggle, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);

    // Wait for pointer release before mounting the dialog. Otherwise the release
    // can land on the newly mounted backdrop and immediately dismiss it.
    expect(onOpenDetail).not.toHaveBeenCalled();

    fireEvent.pointerUp(toggle);
    fireEvent.click(toggle);

    expect(onOpenDetail).toHaveBeenCalledWith(item);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("cancels long press on pointer movement", () => {
    vi.useFakeTimers();
    const onOpenDetail = vi.fn();
    render(<ChecklistItemCard item={item} onOpenDetail={onOpenDetail} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    fireEvent.pointerDown(toggle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(toggle, { clientX: 20, clientY: 0 });
    vi.advanceTimersByTime(500);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it("covers: AC-8 cancels long press on pointer cancellation and unmount", () => {
    vi.useFakeTimers();
    const onOpenDetail = vi.fn();
    const { unmount } = render(<ChecklistItemCard item={item} onOpenDetail={onOpenDetail} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    fireEvent.pointerDown(toggle, { clientX: 4, clientY: 4 });
    fireEvent.pointerCancel(toggle);
    vi.advanceTimersByTime(500);
    expect(onOpenDetail).not.toHaveBeenCalled();

    fireEvent.pointerDown(toggle, { clientX: 4, clientY: 4 });
    unmount();
    vi.advanceTimersByTime(500);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it("covers: AC-8 toggles from the keyboard and exposes its pressed state", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ChecklistItemCard item={item} onToggle={onToggle} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<ChecklistItemCard item={{ ...item, done: true }} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "切换清单项状态：回归测试" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("covers: AC-8 allows another toggle after the 600ms throttle window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00"));
    const onToggle = vi.fn();
    render(<ChecklistItemCard item={item} onToggle={onToggle} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    fireEvent.click(toggle);
    vi.advanceTimersByTime(599);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
