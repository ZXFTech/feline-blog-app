import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChecklistDetailDialog } from "@/components/Checklist/ChecklistDetailDialog";
import { ChecklistItemDetailDialog } from "@/components/Checklist/ChecklistItemDetailDialog";
import type { Checklist } from "@/lib/checklist";

const checklist: Checklist = {
  id: "list-1",
  name: "发布检查",
  themeColor: "#20c997",
  expiresAt: Date.now() + 86_400_000,
  items: [{ id: "item-1", label: "回归测试", detail: "覆盖主要流程", done: false }],
};

describe("Checklist detail dialogs", () => {
  it("covers: AC-8 exposes checklist details and forwards item actions", async () => {
    const onToggleItem = vi.fn();
    const onItemDetail = vi.fn();
    render(
      <ChecklistDetailDialog
        open
        checklist={checklist}
        onOpenChange={vi.fn()}
        onToggleItem={onToggleItem}
        onItemDetail={onItemDetail}
      />
    );

    expect(screen.getByRole("dialog", { name: "发布检查" })).toBeVisible();
    expect(screen.getByText("已完成 0 · 总数 1")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "切换清单项状态：回归测试" }));
    await userEvent.click(screen.getByRole("button", { name: "查看清单项详情" }));

    expect(onToggleItem).toHaveBeenCalledWith(checklist.items[0]);
    expect(onItemDetail).toHaveBeenCalledWith(checklist.items[0]);
  });

  it("covers: AC-8 closes from its close button and Escape key", async () => {
    const onOpenChange = vi.fn();
    render(
      <ChecklistItemDetailDialog open item={checklist.items[0]} onOpenChange={onOpenChange} />
    );

    expect(screen.getByRole("dialog", { name: "回归测试" })).toHaveTextContent("覆盖主要流程");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenCalledWith(
        false,
        expect.objectContaining({ reason: "escape-key" })
      )
    );
  });

  it("covers: AC-8 closes from the explicit close control", async () => {
    const onOpenChange = vi.fn();
    render(
      <ChecklistItemDetailDialog open item={checklist.items[0]} onOpenChange={onOpenChange} />
    );

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: "close-press" })
    );
  });

  it("covers: AC-8 moves focus into the dialog and returns it to the opener", async () => {
    function DialogHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            打开清单项详情
          </button>
          <ChecklistItemDetailDialog open={open} item={checklist.items[0]} onOpenChange={setOpen} />
        </>
      );
    }

    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "打开清单项详情" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "回归测试" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "回归测试" })).toBeNull());
    expect(opener).toHaveFocus();
  });
});
