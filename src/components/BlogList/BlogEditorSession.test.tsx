import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlogEditorSession } from "@/components/BlogList/BlogEditorSession";
import { actionResult } from "@/lib/server/actionResult";
import type { BlogEditorSeed, SavedDraft, SaveDraftInput } from "@/types/blog-draft";
import type { DraftAdapter } from "@/lib/blog/draft-controller";

const seed: BlogEditorSeed = {
  draftId: "455f5421-fb5e-4d51-a33d-a55734fd922c",
  blogId: null,
  title: "original",
  content: "body",
  tags: [],
  revision: 1,
  publishedRevision: 0,
  savedAt: "2026-10-24T00:00:00Z",
};
function adapter(): DraftAdapter {
  return {
    save: vi.fn(async (input: SaveDraftInput) =>
      actionResult.success<SavedDraft>({
        draftId: input.draftId,
        revision: input.expectedRevision + 1,
        publishedRevision: 0,
        savedAt: "2026-10-24T01:00:00Z",
      })
    ),
    publish: vi.fn(),
    load: vi.fn(),
  };
}
beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("editor recovery UI", () => {
  // spec 0016 covers: AC-7. A committed result must remain usable if routing fails.
  it("preserves the published form and article link when navigation throws", async () => {
    const user = userEvent.setup();
    const api = adapter();
    vi.mocked(api.publish).mockResolvedValue(
      actionResult.success({
        blogId: 777,
        publishedRevision: seed.revision,
        publicationState: "available",
      })
    );
    const navigate = vi.fn(() => {
      throw new Error("navigation unavailable");
    });
    render(<BlogEditorSession seed={seed} adapter={api} onNavigate={navigate} />);
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发布已完成，可以通过下方入口查看文章。"
    );
    expect(screen.getByLabelText("文章标题")).toHaveValue(seed.title);
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue(seed.content);
    expect(screen.getByRole("link", { name: "查看已发布文章" })).toHaveAttribute(
      "href",
      "/blog/777"
    );
    expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/blog/777");
  });

  // spec 0016 covers: AC-7. A deleted publication is a completed result, not a new draft.
  it("shows a deleted publication without navigating or offering an article link", async () => {
    const user = userEvent.setup();
    const api = adapter();
    vi.mocked(api.publish).mockResolvedValue(
      actionResult.success({
        blogId: 777,
        publishedRevision: seed.revision,
        publicationState: "deleted",
      })
    );
    const navigate = vi.fn();
    render(<BlogEditorSession seed={seed} adapter={api} onNavigate={navigate} />);
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(await screen.findByRole("status")).toHaveTextContent("发布已完成，但文章现已删除");
    expect(screen.queryByRole("link", { name: "查看已发布文章" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回我的草稿" })).toHaveAttribute(
      "href",
      "/blog/drafts"
    );
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue(seed.content);
    expect(navigate).not.toHaveBeenCalled();
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
  });

  // spec 0016 covers: AC-9. Clipboard denial must still leave an exact, selectable copy.
  it("offers the exact current body for manual copying when clipboard access is refused", async () => {
    const user = userEvent.setup();
    const api = adapter();
    vi.mocked(api.save).mockResolvedValue(actionResult.failure("conflict", "其他设备已更新"));
    const raw = "\n  const local = true;  \n\n";
    render(<BlogEditorSession seed={seed} adapter={api} onNavigate={vi.fn()} />);
    const input = screen.getByLabelText("Markdown 正文");
    await user.clear(input);
    await user.paste(raw);
    await user.click(screen.getByRole("link", { name: "退出编辑" }));
    await screen.findByRole("button", { name: "复制正文" });
    const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "复制正文" }));
    const manual = await screen.findByRole("textbox", { name: "供手动复制的当前正文" });
    expect(manual).toHaveValue(raw);
    expect(manual).toHaveAttribute("readonly");
    expect(input).toHaveValue(raw);
    expect(write).toHaveBeenCalledExactlyOnceWith(raw);
    await user.click(manual);
    expect(manual).toHaveFocus();
    expect((manual as HTMLTextAreaElement).selectionStart).toBe(0);
    expect((manual as HTMLTextAreaElement).selectionEnd).toBe(raw.length);
    expect(api.load).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
  });

  // spec 0016 covers: AC-6, AC-13. Reauthentication is explicit and retains the page.
  it("keeps expired session input and offers login plus an explicit save retry", async () => {
    const user = userEvent.setup();
    const api = adapter();
    vi.mocked(api.save).mockResolvedValueOnce(
      actionResult.failure("unauthenticated", "登录已失效")
    );
    const navigate = vi.fn();
    render(<BlogEditorSession seed={seed} adapter={api} onNavigate={navigate} />);
    const input = screen.getByLabelText("Markdown 正文");
    await user.clear(input);
    await user.paste("会话失效时仍保留的正文");
    await user.click(screen.getByRole("link", { name: "退出编辑" }));
    const login = await screen.findByRole("link", { name: "在新标签页重新登录" });
    expect(login).toHaveAttribute("href", "/login");
    expect(login).toHaveAttribute("target", "_blank");
    expect(input).toHaveValue("会话失效时仍保留的正文");
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("草稿已保存"));
    expect(screen.queryByRole("link", { name: "在新标签页重新登录" })).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
  });

  it("flushes exact raw input through one exit link and never offers an inert save button", async () => {
    const api = adapter(),
      navigate = vi.fn();
    render(<BlogEditorSession seed={seed} adapter={api} onNavigate={navigate} />);
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "退出编辑" })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Markdown 正文"), {
      target: { value: "\n  raw\nnext\n" },
    });
    fireEvent.click(screen.getByRole("link", { name: "退出编辑" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/blog/drafts"));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ content: "\n  raw\nnext\n" }));
  });
  it("preserves input after a refused save, announces failure and exits only after confirmed discard", async () => {
    const api = adapter(),
      navigate = vi.fn();
    vi.mocked(api.save).mockRejectedValue(new Error("offline"));
    render(<BlogEditorSession seed={seed} adapter={api} onNavigate={navigate} />);
    fireEvent.change(screen.getByLabelText("Markdown 正文"), { target: { value: "keep local" } });
    fireEvent.click(screen.getByRole("link", { name: "退出编辑" }));
    await screen.findByText("未能保存，仍停留在编辑页。");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("keep local");
    fireEvent.click(screen.getByRole("button", { name: "放弃未保存修改并退出" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "服务器已保存的草稿与已发布文章会继续保留"
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "放弃未保存修改并退出" }));
    fireEvent.click(screen.getByRole("button", { name: "确认放弃并退出" }));
    expect(navigate).toHaveBeenCalledWith("/blog/drafts");
  });
  it("does not replace new input or publish callbacks when switching to another draft during a slow save", async () => {
    vi.useFakeTimers();
    const api = adapter(),
      navigate = vi.fn();
    let resolve!: (result: ReturnType<typeof actionResult.success<SavedDraft>>) => void;
    vi.mocked(api.save).mockImplementationOnce(
      async () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const { rerender } = render(
      <BlogEditorSession seed={seed} adapter={api} onNavigate={navigate} />
    );
    fireEvent.change(screen.getByLabelText("Markdown 正文"), { target: { value: "old edit" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const next = {
      ...seed,
      draftId: "471947e3-542a-453e-b293-14d6421f6594",
      title: "next",
      content: "new session",
    };
    rerender(<BlogEditorSession seed={next} adapter={api} onNavigate={navigate} />);
    await act(async () => {
      resolve(
        actionResult.success({
          draftId: seed.draftId!,
          revision: 2,
          publishedRevision: 0,
          savedAt: "old",
        })
      );
    });
    expect(screen.getByLabelText("文章标题")).toHaveValue("next");
    expect(screen.getByLabelText("Markdown 正文")).toHaveValue("new session");
    expect(navigate).not.toHaveBeenCalled();
  });
});
