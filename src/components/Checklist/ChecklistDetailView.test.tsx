import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChecklistDetailView } from "@/components/Checklist/ChecklistDetailView";
import type { ChecklistDetail } from "@/types/checklist";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toggleChecklistItem: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItemDetail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/components/ProMessage", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/db/checklistAction", () => ({
  getChecklistDetail: vi.fn(),
  addChecklistItem: mocks.addChecklistItem,
  restoreChecklist: vi.fn(),
  restoreChecklistItem: vi.fn(),
  restoreChecklistItems: vi.fn(),
  softDeleteChecklist: vi.fn(),
  softDeleteChecklistItem: vi.fn(),
  softDeleteChecklistItems: vi.fn(),
  toggleChecklistItem: mocks.toggleChecklistItem,
  updateChecklistItemDetail: mocks.updateChecklistItemDetail,
}));

const detail: ChecklistDetail = {
  id: "list-1",
  name: "发布检查",
  themeColor: "#046582",
  expiresAt: "2026-09-22T01:00:00.000Z",
  expiryState: "active",
  confirmationState: "unconfirmed",
  itemCount: 1,
  confirmedCount: 0,
  revision: 1,
  serverNow: "2026-09-20T00:00:00.000Z",
  items: [
    {
      id: "item-1",
      detail: "执行回归测试",
      confirmedAt: null,
      createdOrder: 1,
      revision: 1,
    },
  ],
};

describe("ChecklistDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps only the checklist identity row inside the raised panel", () => {
    render(<ChecklistDetailView initial={detail} />);

    const heading = screen.getByRole("heading", { name: "发布检查" });
    const raisedPanel = heading.closest(".shadow-neu-raised");
    expect(raisedPanel).not.toBeNull();
    expect(raisedPanel).toHaveTextContent("发布检查");
    expect(raisedPanel).not.toHaveTextContent("已确认 0 项，共 1 项");
    expect(raisedPanel).not.toContainElement(screen.getByRole("link", { name: "返回清单列表" }));
  });

  it("filters checklist items from the button group before the add action", async () => {
    const user = userEvent.setup();
    const filteredDetail: ChecklistDetail = {
      ...detail,
      itemCount: 2,
      confirmedCount: 1,
      confirmationState: "partial",
      items: [
        detail.items[0],
        {
          id: "item-2",
          detail: "发布生产版本",
          confirmedAt: "2026-09-20T12:00:00.000Z",
          createdOrder: 2,
          revision: 1,
        },
      ],
    };
    render(<ChecklistDetailView initial={filteredDetail} />);

    const filters = screen.getByRole("group", { name: "清单项完成状态筛选" });
    const addButton = screen.getByRole("button", { name: "新增清单项" });
    expect(
      filters.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(filters).getByRole("button", { name: "全部" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(within(filters).getByRole("button", { name: "已完成" }));
    expect(screen.getByText("发布生产版本")).toBeVisible();
    expect(screen.queryByText("执行回归测试")).not.toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "未完成" }));
    expect(screen.getByText("执行回归测试")).toBeVisible();
    expect(screen.queryByText("发布生产版本")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "批量管理" }));
    await user.click(screen.getByRole("button", { name: "选择清单项：执行回归测试" }));
    expect(screen.getByRole("button", { name: "删除 1 项" })).toBeVisible();
    await user.click(within(filters).getByRole("button", { name: "未完成" }));
    expect(screen.getByRole("button", { name: "删除 1 项" })).toBeVisible();
    await user.click(within(filters).getByRole("button", { name: "已完成" }));
    expect(screen.queryByRole("button", { name: "删除 1 项" })).not.toBeInTheDocument();
  });

  it("shows a filter specific empty state", async () => {
    render(<ChecklistDetailView initial={detail} />);

    await userEvent.click(screen.getByRole("button", { name: "已完成" }));

    expect(screen.getByRole("status")).toHaveTextContent("没有已完成的清单项");
  });

  it("preserves the local filter across same-route reads and resets it for another checklist", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChecklistDetailView initial={detail} />);
    const filters = screen.getByRole("group", { name: "清单项完成状态筛选" });

    await user.click(within(filters).getByRole("button", { name: "未完成" }));
    rerender(<ChecklistDetailView initial={{ ...detail, revision: 2 }} />);
    expect(within(filters).getByRole("button", { name: "未完成" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    rerender(<ChecklistDetailView initial={{ ...detail, id: "list-2" }} />);
    await waitFor(() =>
      expect(within(filters).getByRole("button", { name: "全部" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
  });

  it("filters by the pending completion target and restores focus after the card leaves", async () => {
    let resolveToggle:
      | ((value: {
          status: "success";
          data: {
            confirmedAt: string;
            itemRevision: number;
            parentRevision: number;
            serverNow: string;
          };
        }) => void)
      | undefined;
    mocks.toggleChecklistItem.mockReturnValue(
      new Promise((resolve) => {
        resolveToggle = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ChecklistDetailView initial={detail} />);
    const filters = screen.getByRole("group", { name: "清单项完成状态筛选" });
    const incompleteFilter = within(filters).getByRole("button", { name: "未完成" });

    await user.click(incompleteFilter);
    await user.click(screen.getByRole("button", { name: "切换清单项状态：执行回归测试" }));

    await waitFor(() => expect(incompleteFilter).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("没有未完成的清单项");
    resolveToggle?.({
      status: "success",
      data: {
        confirmedAt: "2026-09-20T12:00:00.000Z",
        itemRevision: 2,
        parentRevision: 2,
        serverNow: "2026-09-20T12:00:00.000Z",
      },
    });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "“执行回归测试”已标记为已完成。没有未完成的清单项"
      )
    );
  });

  it("blocks repeat toggles while the current update is pending", async () => {
    let resolveToggle:
      | ((value: {
          status: "success";
          data: {
            confirmedAt: string;
            itemRevision: number;
            parentRevision: number;
            serverNow: string;
          };
        }) => void)
      | undefined;
    mocks.toggleChecklistItem.mockReturnValue(
      new Promise((resolve) => {
        resolveToggle = resolve;
      })
    );

    render(<ChecklistDetailView initial={detail} />);

    const toggle = screen.getByRole("button", {
      name: "切换清单项状态：执行回归测试",
    });
    fireEvent.click(toggle);

    await waitFor(() => expect(mocks.toggleChecklistItem).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("更新中");
    expect(toggle).toBeDisabled();

    fireEvent.click(toggle);
    expect(mocks.toggleChecklistItem).toHaveBeenCalledOnce();

    resolveToggle?.({
      status: "success",
      data: {
        confirmedAt: "2026-09-20T12:00:00.000Z",
        itemRevision: 2,
        parentRevision: 2,
        serverNow: "2026-09-20T12:00:00.000Z",
      },
    });

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "切换清单项状态：执行回归测试" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("edits an item in a dialog and keeps the detail dialog read only", async () => {
    mocks.updateChecklistItemDetail.mockResolvedValue({
      status: "success",
      data: {
        detail: "完成发布前回归测试",
        itemRevision: 2,
        parentRevision: 2,
        serverNow: "2026-09-20T12:00:00.000Z",
      },
    });
    render(<ChecklistDetailView initial={detail} />);

    await userEvent.click(screen.getByRole("button", { name: "批量管理" }));
    await userEvent.click(screen.getByRole("button", { name: "编辑清单项" }));
    const editor = screen.getByRole("textbox", { name: "清单项详情" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "完成发布前回归测试");
    await userEvent.click(screen.getByRole("button", { name: "保存项目" }));

    await waitFor(() => {
      expect(mocks.updateChecklistItemDetail).toHaveBeenCalledWith({
        checklistId: "list-1",
        itemId: "item-1",
        detail: "完成发布前回归测试",
        itemRevision: 1,
        parentRevision: 1,
      });
    });
    expect(screen.queryByRole("dialog", { name: "编辑清单项" })).not.toBeInTheDocument();
    expect(screen.getByText("完成发布前回归测试")).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "退出批量管理" }));
    await userEvent.click(screen.getByRole("button", { name: "查看清单项详情" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("完成发布前回归测试");
    expect(screen.queryByRole("textbox", { name: "清单项详情" })).not.toBeInTheDocument();
  });
});

describe("adding checklist items", () => {
  it("retains the draft and request id after failure, then updates the visible list", async () => {
    const user = userEvent.setup();
    mocks.addChecklistItem
      .mockReset()
      .mockResolvedValueOnce({ status: "temporary_failure", message: "请重试" })
      .mockImplementationOnce(async (input) => ({
        status: "success",
        data: {
          ...detail,
          revision: 2,
          itemCount: 2,
          items: [
            {
              id: input.itemId,
              detail: input.detail,
              confirmedAt: null,
              createdOrder: 2,
              revision: 1,
            },
            ...detail.items,
          ],
        },
      }));
    render(<ChecklistDetailView initial={detail} />);
    await user.click(screen.getByRole("button", { name: "新增清单项" }));
    await user.type(screen.getByLabelText("清单项详情"), "新项目");
    await user.click(screen.getByRole("button", { name: "确认增加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请重试");
    expect(screen.getByLabelText("清单项详情")).toHaveValue("新项目");
    await user.click(screen.getByRole("button", { name: "确认增加" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.addChecklistItem).toHaveBeenCalledTimes(2);
    expect(mocks.addChecklistItem.mock.calls[0][0].itemId).toBe(
      mocks.addChecklistItem.mock.calls[1][0].itemId
    );
    expect(screen.getByText("已确认 0 项，共 2 项")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换清单项状态：新项目" })).toBeInTheDocument();
  });

  it("keeps the completed filter and existing selection when an incomplete item is added", async () => {
    const user = userEvent.setup();
    const completedItem = {
      id: "item-2",
      detail: "发布生产版本",
      confirmedAt: "2026-09-20T12:00:00.000Z",
      createdOrder: 2,
      revision: 1,
    };
    const filteredDetail: ChecklistDetail = {
      ...detail,
      itemCount: 2,
      confirmedCount: 1,
      confirmationState: "partial",
      items: [completedItem, ...detail.items],
    };
    mocks.addChecklistItem.mockImplementationOnce(async (input) => ({
      status: "success",
      data: {
        ...filteredDetail,
        revision: 2,
        itemCount: 3,
        items: [
          {
            id: input.itemId,
            detail: input.detail,
            confirmedAt: null,
            createdOrder: 3,
            revision: 1,
          },
          ...filteredDetail.items,
        ],
      },
    }));
    render(<ChecklistDetailView initial={filteredDetail} />);
    const filters = screen.getByRole("group", { name: "清单项完成状态筛选" });
    const completedFilter = within(filters).getByRole("button", { name: "已完成" });

    await user.click(completedFilter);
    await user.click(screen.getByRole("button", { name: "批量管理" }));
    await user.click(screen.getByRole("button", { name: "选择清单项：发布生产版本" }));
    const addButton = screen.getByRole("button", { name: "新增清单项" });
    await user.click(addButton);
    await user.type(screen.getByLabelText("清单项详情"), "新项目");
    await user.click(screen.getByRole("button", { name: "确认增加" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(completedFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("新项目")).not.toBeInTheDocument();
    expect(screen.getByText("已确认 1 项，共 3 项")).toBeVisible();
    expect(screen.getByRole("button", { name: "删除 1 项" })).toBeVisible();
    await waitFor(() => expect(addButton).toHaveFocus());
  });
});
