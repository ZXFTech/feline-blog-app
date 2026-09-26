import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import DialogDemo from "@/app/album/_components/demos/DialogDemo";

describe("DialogDemo", () => {
  it("groups all dialog families and keeps theme representatives closed", () => {
    const { rerender } = render(<DialogDemo />);

    expect(screen.getByRole("heading", { name: "1. 通用对话框 Dialog" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. 确认对话框 AlertDialog" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "3. 受控弹窗 Modal" })).toBeVisible();

    rerender(<DialogDemo compact />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("opens and confirms the accessible dialogs", async () => {
    const user = userEvent.setup();
    render(<DialogDemo />);

    await user.click(screen.getByRole("button", { name: "打开通用对话框" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "组件展示说明" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("已在本地确认通用对话框")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "打开删除确认" }));
    const alertDialog = screen.getByRole("alertdialog");
    await user.click(within(alertDialog).getByRole("button", { name: "确认移除" }));
    expect(screen.getByText("已确认本地删除样例")).toBeVisible();
  });

  it("keeps the legacy Modal result inside local state", async () => {
    const user = userEvent.setup();
    render(<DialogDemo />);

    await user.click(screen.getByRole("button", { name: "打开受控弹窗" }));
    expect(await screen.findByText("本地发布检查")).toBeVisible();
    expect(document.querySelector('[data-slot="modal-panel"]')).toHaveAttribute(
      "data-variant",
      "form"
    );
    expect(document.querySelector('[data-slot="modal-panel"]')).toHaveClass(
      "rounded-xl",
      "shadow-neu-raised"
    );
    await user.click(screen.getByRole("button", { name: "确认本地操作" }));
    expect(screen.getByText("已确认受控弹窗")).toBeVisible();
  });
});
