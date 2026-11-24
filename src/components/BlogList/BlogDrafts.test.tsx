import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlogDrafts } from "@/components/BlogList/BlogDrafts";
import { actionResult } from "@/lib/server/actionResult";
import type { DraftListPage, DraftListRow } from "@/types/blog-draft";

const actions = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn() }));
// Server Actions are the transport boundary. Render the real list and confirmation dialog.
vi.mock("@/db/blogDraftAction", () => ({
  getMyBlogDrafts: actions.read,
  discardBlogDraft: actions.remove,
}));

const row: DraftListRow = {
  id: "7e5fc4b8-01b1-49f7-ab75-3dd1b2f268ee",
  title: "作者的私有草稿",
  blogId: 42,
  revision: 4,
  savedAt: "2026-10-26T00:00:00Z",
};
const page: DraftListPage = { rows: [row], page: 1, pageSize: 20, total: 1 };
const empty: DraftListPage = { rows: [], page: 1, pageSize: 20, total: 0 };

beforeEach(() => vi.resetAllMocks());

describe("spec 0016 private draft management", () => {
  // covers: AC-11. A failed initial read can recover without remounting the page.
  it("retries an initial read failure and presents the empty list", async () => {
    const user = userEvent.setup();
    actions.read.mockResolvedValue(actionResult.success(empty));
    render(<BlogDrafts initial={actionResult.failure("temporary_failure", "unavailable")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取草稿，请重试。");
    await user.click(screen.getByRole("button", { name: "重新读取草稿" }));
    expect(await screen.findByText("还没有待发布的草稿")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新建文章" })).toHaveAttribute("href", "/blog/new");
    expect(actions.read).toHaveBeenCalledExactlyOnceWith(1);
  });

  // covers: AC-9, AC-11. Cancellation is inert and a stale delete cannot remove newer work.
  it("retains a conflicted row and uses the newly loaded revision for a later confirmed deletion", async () => {
    const user = userEvent.setup();
    actions.remove
      .mockResolvedValueOnce(actionResult.failure("conflict", "updated elsewhere"))
      .mockResolvedValueOnce(actionResult.success({ draftId: row.id }));
    actions.read
      .mockResolvedValueOnce(
        actionResult.success({
          ...page,
          rows: [{ ...row, title: "另一设备的新标题", revision: 5 }],
        })
      )
      .mockResolvedValueOnce(actionResult.success(empty));
    render(<BlogDrafts initial={actionResult.success(page)} />);
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("已发布文章会继续保留");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(actions.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("草稿已更新，删除已停止。");
    expect(screen.getByRole("heading", { name: row.title })).toBeVisible();
    expect(actions.read).not.toHaveBeenCalled();
    expect(actions.remove).toHaveBeenCalledExactlyOnceWith({
      draftId: row.id,
      expectedRevision: 4,
    });
    await user.click(screen.getByRole("button", { name: "重新读取草稿" }));
    await screen.findByRole("heading", { name: "另一设备的新标题" });
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByText("还没有待发布的草稿")).toBeVisible();
    expect(actions.remove).toHaveBeenLastCalledWith({ draftId: row.id, expectedRevision: 5 });
  });

  // covers: AC-11. A successful mutation does not imply the following read succeeded.
  it("keeps the last known list after a failed post-delete read and accepts the clamped page on retry", async () => {
    const user = userEvent.setup();
    actions.remove.mockResolvedValue(actionResult.success({ draftId: row.id }));
    actions.read
      .mockResolvedValueOnce(actionResult.failure("temporary_failure", "删除后暂时无法重新读取"))
      .mockResolvedValueOnce(
        actionResult.success({
          ...empty,
          total: 20,
          rows: [{ ...row, id: "remaining", title: "其余草稿" }],
        })
      );
    render(<BlogDrafts initial={actionResult.success({ ...page, page: 2, total: 21 })} />);
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("删除后暂时无法重新读取");
    expect(screen.getByRole("heading", { name: row.title })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新读取草稿" }));
    await screen.findByRole("heading", { name: "其余草稿" });
    expect(screen.getByRole("status")).toHaveTextContent("共 20 份待发布草稿，第 1 页");
    expect(screen.queryByRole("heading", { name: row.title })).not.toBeInTheDocument();
    expect(actions.read.mock.calls).toEqual([[2], [2]]);
    expect(actions.remove).toHaveBeenCalledTimes(1);
  });

  // covers: AC-11. Transport failure preserves the row and exposes an explicit recovery action.
  it("keeps the draft after a rejected deletion request and reports a safe retry message", async () => {
    const user = userEvent.setup();
    actions.remove.mockRejectedValue(new Error("private transport diagnostic"));
    render(<BlogDrafts initial={actionResult.success(page)} />);
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "请求失败，草稿条目仍保留，请重试。"
    );
    expect(screen.getByRole("heading", { name: row.title })).toBeVisible();
    expect(screen.getByRole("button", { name: "重新读取草稿" })).toBeEnabled();
    expect(screen.queryByText("private transport diagnostic")).not.toBeInTheDocument();
    expect(actions.remove).toHaveBeenCalledTimes(1);
    expect(actions.read).not.toHaveBeenCalled();
  });

  // covers: AC-11, AC-12. A pending deletion is exclusive and reports its loading state.
  it("disables list actions while one confirmed deletion is pending", async () => {
    const user = userEvent.setup();
    let complete!: (value: ReturnType<typeof actionResult.success<{ draftId: string }>>) => void;
    actions.remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    actions.read.mockResolvedValue(actionResult.success(empty));
    render(<BlogDrafts initial={actionResult.success(page)} />);
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    await user.dblClick(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在读取草稿…");
    expect(screen.getByRole("button", { name: "删除草稿" })).toBeDisabled();
    expect(actions.remove).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete(actionResult.success({ draftId: row.id }));
    });
    await waitFor(() => expect(screen.getByText("还没有待发布的草稿")).toBeVisible());
  });
});
