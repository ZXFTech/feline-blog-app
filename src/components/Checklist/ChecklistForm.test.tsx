import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
      detail: "覆盖关键流程",
    },
  ],
};

describe("ChecklistForm", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["MacIntel", "⌘", "{Meta>}{Enter}{/Meta}"],
    ["Win32", "Ctrl", "{Control>}{Enter}{/Control}"],
    ["Linux x86_64", "Ctrl", "{Control>}{Enter}{/Control}"],
  ])("prepends items and uses the matching shortcut on %s", async (platform, label, keys) => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <ChecklistForm
        mode="edit"
        initialValues={editValues}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    expect(container.querySelector('[data-slot="kbd"]')).toHaveTextContent(label);
    const input = screen.getByRole("textbox", { name: "清单项详情" });
    await user.type(input, "新增的第一项");
    await user.keyboard(keys);
    await waitFor(() => expect(input).toHaveValue(""));
    expect(container.querySelector("ul > li")).toHaveTextContent("新增的第一项");
    await user.type(input, "新增的第二项");
    await user.keyboard(keys);
    await waitFor(() => expect(input).toHaveValue(""));
    expect(container.querySelector("ul > li")).toHaveTextContent("新增的第二项");
    await user.click(screen.getAllByRole("button", { name: "编辑清单项" })[0]);
    const editor = screen.getByRole("textbox", { name: "清单项详情" });
    await user.clear(editor);
    await user.type(editor, "编辑后的第二项");
    await user.keyboard(keys);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0].items.map((item: { detail: string }) => item.detail)).toEqual([
      "编辑后的第二项",
      "新增的第一项",
      "覆盖关键流程",
    ]);
  });

  it.each(["create", "edit"] as const)(
    "adds composer content with Ctrl+Enter in %s mode without submitting the checklist",
    async (mode) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <ChecklistForm
          mode={mode}
          initialValues={emptyValues}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      );
      const input = screen.getByRole("textbox", { name: "清单项详情" });
      await user.click(input);
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(screen.getByText("已添加清单项（0）")).toBeVisible();
      expect(input).not.toHaveAttribute("aria-invalid", "true");
      await user.type(input, "   ");
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(input).toHaveValue("   ");
      expect(screen.getByText("已添加清单项（0）")).toBeVisible();
      await user.clear(input);
      await user.type(input, "第一行{Enter}第二行");
      expect(input).toHaveValue("第一行\n第二行");
      await user.click(screen.getByRole("textbox", { name: "清单名" }));
      await user.keyboard("{Control>}{Enter}{/Control}");
      await waitFor(() => expect(screen.getByText("已添加清单项（1）")).toBeVisible());
      expect(input).toHaveValue("");
      await waitFor(() => expect(input).toHaveFocus());
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(screen.getByText("已添加清单项（1）")).toBeVisible();
      expect(onSubmit).not.toHaveBeenCalled();
    }
  );

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
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

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

    expect(screen.getByText("尚未添加项目。请先在上方填写详情并点击添加。")).toBeVisible();
    await userEvent.type(screen.getByRole("textbox", { name: "清单项详情" }), "完成回归测试");
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByText("已添加清单项（1）")).toBeVisible();
    expect(screen.getByText("完成回归测试")).toBeVisible();

    const addedItems = screen
      .getByRole("heading", { name: "已添加清单项（1）" })
      .closest("section");
    expect(addedItems?.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "添加" })).toHaveAttribute("data-slot", "button");
    expect(screen.getByRole("button", { name: "添加" }).parentElement).toHaveClass("justify-end");

    await userEvent.click(screen.getByRole("button", { name: "删除清单项" }));
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.getByText("已添加清单项（0）")).toBeVisible();
  });

  it("saves an edited checklist item with Ctrl and Enter", async () => {
    render(
      <ChecklistForm mode="edit" initialValues={editValues} onSubmit={vi.fn()} onCancel={vi.fn()} />
    );

    await userEvent.click(screen.getByRole("button", { name: "编辑清单项" }));
    const detail = screen.getByRole("textbox", { name: "清单项详情" });
    await userEvent.clear(detail);
    await userEvent.type(detail, "快捷键保存后的项目");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("快捷键保存后的项目")).toBeVisible();
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

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    const nameError = await screen.findByText("清单名需为 1 到 100 个字符");
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
    expect(screen.getByText("请选择截止日期时间")).toBeVisible();
    expect(screen.getByRole("button", { name: "选择截止日期时间" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

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

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");

    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
