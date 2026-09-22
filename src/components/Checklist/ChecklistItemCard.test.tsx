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

  it("hides management actions by default and removes them from keyboard navigation on exit", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <ChecklistItemCard item={item} onEdit={onEdit} onDelete={onDelete} />
    );
    expect(screen.queryByRole("button", { name: "编辑清单项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除清单项" })).not.toBeInTheDocument();
    rerender(
      <ChecklistItemCard
        item={item}
        selectionMode
        showActions
        onEdit={onEdit}
        onDelete={onDelete}
        onSelect={onSelect}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "编辑清单项" }));
    await userEvent.click(screen.getByRole("button", { name: "删除清单项" }));
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(onDelete).toHaveBeenCalledWith(item);
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<ChecklistItemCard item={item} showActions />);
    expect(screen.queryByRole("button", { name: "编辑清单项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除清单项" })).not.toBeInTheDocument();
  });

  it("uses square status icons with two pixel strokes and preserves status colours", () => {
    const { rerender } = render(<ChecklistItemCard item={item} />);
    expect(screen.getByRole("img", { name: "未确认" })).toHaveAttribute("stroke-width", "2");
    expect(screen.getByRole("img", { name: "未确认" })).toHaveClass(
      "lucide-square-exclamation-point"
    );
    rerender(<ChecklistItemCard item={{ ...item, done: true }} />);
    expect(screen.getByRole("img", { name: "已确认" })).toHaveAttribute("stroke-width", "2");
    expect(screen.getByRole("img", { name: "已确认" })).toHaveClass("lucide-square-check-big");
  });

  it("toggles from the detail region and opens the read only detail action separately", async () => {
    const onToggle = vi.fn();
    const onOpenDetail = vi.fn();
    render(<ChecklistItemCard item={item} onToggle={onToggle} onOpenDetail={onOpenDetail} />);
    const toggle = screen.getByRole("button", { name: "切换清单项状态：回归测试" });

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();

    const detail = screen.getByRole("button", { name: "查看清单项详情" });
    expect(detail).toBeVisible();
    await userEvent.click(detail);
    expect(onOpenDetail).toHaveBeenCalledWith(item);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(toggle.parentElement).toHaveClass("flex-1");
  });

  it("keeps delete and edit actions separate from the detail-region toggle", async () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    render(
      <ChecklistItemCard
        item={item}
        showActions
        onToggle={onToggle}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "删除清单项" }));
    await userEvent.click(screen.getByRole("button", { name: "编辑清单项" }));

    expect(onDelete).toHaveBeenCalledWith(item);
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("blocks every card action behind a loading overlay while a toggle is pending", async () => {
    const onToggle = vi.fn();
    const onOpenDetail = vi.fn();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    render(
      <ChecklistItemCard
        item={item}
        showActions
        loading
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("更新中");
    expect(screen.getByRole("button", { name: "切换清单项状态：回归测试" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "查看清单项详情" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除清单项" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑清单项" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "切换清单项状态：回归测试" }));
    await userEvent.click(screen.getByRole("button", { name: "查看清单项详情" }));
    await userEvent.click(screen.getByRole("button", { name: "删除清单项" }));
    await userEvent.click(screen.getByRole("button", { name: "编辑清单项" }));

    expect(onToggle).not.toHaveBeenCalled();
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("uses separate shared icon buttons aligned to opposite card edges", () => {
    render(
      <ChecklistItemCard item={item} size="sm" showActions onEdit={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "删除清单项" })).toHaveAttribute(
      "data-slot",
      "button"
    );
    expect(screen.getByRole("button", { name: "编辑清单项" })).toHaveClass("size-[1.8125rem]");
    expect(screen.getByRole("button", { name: "删除清单项" }).parentElement).not.toHaveAttribute(
      "data-slot",
      "button-group"
    );
    expect(screen.getByRole("button", { name: "删除清单项" }).parentElement).toHaveClass(
      "w-full",
      "justify-between"
    );
  });

  it("uses the detail region as the selection control in batch mode", async () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    render(<ChecklistItemCard item={item} selectionMode onToggle={onToggle} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: "选择清单项：回归测试" }));
    expect(onSelect).toHaveBeenCalledWith(item);
    expect(onToggle).not.toHaveBeenCalled();
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
