import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BlogDraftsView } from "@/components/BlogList/BlogDraftsView";
import type { DraftListPage } from "@/types/blog-draft";

function fixture() {
  let complete!: () => void;
  const operation = new Promise<void>((resolve) => {
    complete = resolve;
  });
  function Wrapper() {
    const [data, setData] = useState<DraftListPage>({
      rows: ["first", "middle", "next"].map((id) => ({
        id,
        title: id,
        blogId: null,
        revision: 1,
        savedAt: "2026-10-24T00:00:00Z",
      })),
      total: 3,
      page: 1,
      pageSize: 20,
    });
    return (
      <BlogDraftsView
        data={data}
        onPage={() => {}}
        onDelete={async (row) => {
          await operation;
          setData((previous) => ({
            ...previous,
            rows: previous.rows.filter((item) => item.id !== row.id),
            total: previous.total - 1,
          }));
          return true;
        }}
      />
    );
  }
  render(<Wrapper />);
  return { complete };
}
describe("draft deletion focus", () => {
  it("moves focus from the removed middle row to the following row", async () => {
    const user = userEvent.setup();
    const { complete } = fixture();
    await user.click(
      within(screen.getByText("middle", { exact: true }).closest("li")!).getByRole("button", {
        name: "删除草稿",
      })
    );
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await act(async () => {
      complete();
    });
    const next = within(screen.getByText("next", { exact: true }).closest("li")!).getByRole(
      "link",
      { name: "继续编辑" }
    );
    await waitFor(() => expect(next).toHaveFocus());
  });
  it("does not steal focus when the author moves to another control during deletion", async () => {
    const user = userEvent.setup();
    const { complete } = fixture();
    await user.click(
      within(screen.getByText("middle", { exact: true }).closest("li")!).getByRole("button", {
        name: "删除草稿",
      })
    );
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    const first = within(screen.getByText("first", { exact: true }).closest("li")!).getByRole(
      "link",
      { name: "继续编辑" }
    );
    first.focus();
    await act(async () => {
      complete();
    });
    await waitFor(() =>
      expect(screen.queryByText("middle", { exact: true })).not.toBeInTheDocument()
    );
    expect(first).toHaveFocus();
  });
});
