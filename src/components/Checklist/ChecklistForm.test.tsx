import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChecklistForm, type ChecklistFormValues } from "@/components/Checklist/ChecklistForm";

const emptyValues: ChecklistFormValues = {
  name: "",
  themeColor: "",
  expiresAt: { kind: "none", localDateTime: "" },
  items: [],
};

const editValues: ChecklistFormValues = {
  name: "发布检查",
  themeColor: "#20c997",
  expiresAt: { kind: "none", localDateTime: "" },
  items: [
    {
      kind: "existing",
      itemId: "item-1",
      expectedRevision: 3,
      clientKey: "client-1",
      name: "完成回归测试",
      detail: "覆盖关键流程",
    },
  ],
};

describe("ChecklistForm", () => {
  it("covers: AC-8 submits edited values without losing item identity", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ChecklistForm
        mode="edit"
        initialValues={editValues}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    await userEvent.clear(screen.getByRole("textbox", { name: "清单名" }));
    await userEvent.type(screen.getByRole("textbox", { name: "清单名" }), "正式发布检查");
    await userEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      ...editValues,
      name: "正式发布检查",
    });
  });

  it("covers: AC-8 adds and removes items with accessible controls", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ChecklistForm
        mode="create"
        initialValues={emptyValues}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("暂无清单项，点击「添加清单项」新增。")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "添加清单项" }));
    expect(screen.getByText("清单项（1）")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "清单项名称" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "移除第 1 项" }));
    expect(screen.getByText("清单项（0）")).toBeVisible();
  });

  it("covers: AC-8 links required validation errors to their fields", async () => {
    render(
      <ChecklistForm
        mode="create"
        initialValues={emptyValues}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "创建清单" }));

    const nameError = await screen.findByText("请填写清单名");
    expect(nameError).toHaveAttribute("role", "alert");
    expect(screen.getByRole("textbox", { name: "清单名" })).toHaveAttribute(
      "aria-describedby",
      nameError.id
    );
    expect(screen.getByRole("radiogroup", { name: "主题色" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("covers: AC-8 reveals and validates the optional deadline", async () => {
    render(
      <ChecklistForm
        mode="create"
        initialValues={{ ...emptyValues, name: "发布检查", themeColor: "#20c997" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "指定截止日期时间" }));
    expect(screen.getByRole("button", { name: "截止日期时间" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "创建清单" }));

    expect(await screen.findByText("请填写截止日期时间")).toHaveAttribute("role", "alert");
  });

  it("covers: AC-8 reports submit failures and keeps cancel independent", async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error("保存失败"));
    render(
      <ChecklistForm
        mode="edit"
        initialValues={editValues}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");

    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
