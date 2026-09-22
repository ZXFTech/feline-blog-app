import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChecklistCard } from "@/components/Checklist/ChecklistCard";
import type { Checklist } from "@/lib/checklist";

const checklist: Checklist = {
  id: "list-1",
  name: "发布检查",
  themeColor: "#046582",
  expiresAt: Date.now() + 86_400_000,
  items: [{ id: "item-1", label: "回归测试", done: false }],
};

describe("ChecklistCard", () => {
  it("opens detail from its native button without nesting edit and delete actions", () => {
    const onOpenDetail = vi.fn();
    const onDelete = vi.fn();
    render(<ChecklistCard checklist={checklist} onOpenDetail={onOpenDetail} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "查看清单详情：发布检查" }));
    expect(onOpenDetail).toHaveBeenCalledWith(checklist);

    fireEvent.click(screen.getByRole("button", { name: "删除清单" }));
    expect(onDelete).toHaveBeenCalledWith(checklist);
    expect(onOpenDetail).toHaveBeenCalledOnce();
  });

  it("covers: AC-8 opens detail with Enter and Space", async () => {
    const onOpenDetail = vi.fn();
    render(<ChecklistCard checklist={checklist} onOpenDetail={onOpenDetail} />);
    const detail = screen.getByRole("button", { name: "查看清单详情：发布检查" });

    detail.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");

    expect(onOpenDetail).toHaveBeenCalledTimes(2);
    expect(onOpenDetail).toHaveBeenLastCalledWith(checklist);
  });

  it("covers: AC-8 keeps edit and delete actions isolated from detail", async () => {
    const onOpenDetail = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ChecklistCard
        checklist={checklist}
        onOpenDetail={onOpenDetail}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "编辑清单" }));
    await userEvent.click(screen.getByRole("button", { name: "删除清单" }));

    expect(onEdit).toHaveBeenCalledWith(checklist);
    expect(onDelete).toHaveBeenCalledWith(checklist);
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "删除清单" }).parentElement).toHaveClass(
      "w-full",
      "justify-between"
    );
    expect(screen.getByRole("button", { name: "删除清单" }).parentElement).not.toHaveAttribute(
      "data-slot",
      "button-group"
    );
  });

  it("keeps list metadata on one line with the countdown after the title", () => {
    const { container } = render(<ChecklistCard checklist={checklist} layout="list" size="md" />);
    const title = screen.getByRole("heading", { name: "发布检查" });
    const countdown = screen.getByText(/^(?:> \d+d|< \d+h)$/);
    const status = screen.getByRole("img", { name: "未确认 0/1" });

    expect(title.parentElement).toHaveClass("whitespace-nowrap");
    expect(status).toHaveStyle({ width: "14px", height: "14px" });
    expect(
      title.compareDocumentPosition(countdown) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.querySelector("p")).toHaveClass("whitespace-nowrap");
  });
});
