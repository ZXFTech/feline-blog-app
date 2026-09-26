import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import ChecklistWorkflowDemo from "@/app/album/_components/demos/ChecklistWorkflowDemo";

describe("ChecklistWorkflowDemo", () => {
  it("shows every checklist workflow component in one family", () => {
    render(<ChecklistWorkflowDemo />);

    expect(screen.getByRole("heading", { name: "1. 清单项卡片 ChecklistItemCard" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. 清单表单 ChecklistForm" })).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "3. 清单与清单项详情 ChecklistDetailDialog / ChecklistItemDetailDialog",
      })
    ).toBeVisible();
  });

  it("toggles and restores a checklist item inside the local sandbox", async () => {
    const user = userEvent.setup();
    render(<ChecklistWorkflowDemo />);
    const sandbox = within(screen.getByTestId("checklist-item-sandbox"));
    const toggle = sandbox.getByRole("button", { name: "切换清单项状态：执行回归测试" });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(sandbox.getByText("已标记为已确认")).toBeVisible();

    await user.click(sandbox.getByRole("button", { name: "恢复清单项" }));
    expect(sandbox.getByRole("button", { name: "切换清单项状态：执行回归测试" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("opens the real item detail dialog and closes it", async () => {
    const user = userEvent.setup();
    render(<ChecklistWorkflowDemo />);

    await user.click(screen.getByRole("button", { name: "打开清单项详情" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "完成代码审查" })).toBeVisible();
    expect(within(dialog).getByText("关键改动已由同伴复核")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("submits locally and exposes the production form error state", async () => {
    const user = userEvent.setup();
    render(<ChecklistWorkflowDemo />);
    const sandbox = within(screen.getByTestId("checklist-form-sandbox"));

    await user.click(sandbox.getByRole("button", { name: "编辑模式" }));
    await user.click(sandbox.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(sandbox.getByText("已在本地保存：版本发布检查，共 2 项")).toBeVisible()
    );

    await user.click(sandbox.getByRole("button", { name: "下一次提交模拟失败" }));
    await user.click(sandbox.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(sandbox.getByRole("alert")).toHaveTextContent("模拟保存失败"));
  });
});
