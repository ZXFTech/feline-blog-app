import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdjacentBlogs from "@/components/Blog/AdjacentBlogs";
import { getAdjacentBlogs } from "@/db/blogAction";

vi.mock("@/db/blogAction", () => ({ getAdjacentBlogs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
type Result = Awaited<ReturnType<typeof getAdjacentBlogs>>;
function deferred() {
  let resolve!: (result: Result) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Result>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const ready = (title: string): Result => ({
  status: "success",
  data: { prev: { id: 8, title, createdAt: new Date() }, next: null },
});
beforeEach(() => vi.resetAllMocks());

describe("AdjacentBlogs recovery", () => {
  it("does not turn failure into a boundary, retries locally, and restores focus", async () => {
    const retry = deferred();
    vi.mocked(getAdjacentBlogs)
      .mockResolvedValueOnce({ status: "temporary_failure", message: "private" })
      .mockReturnValueOnce(retry.promise);
    render(<AdjacentBlogs id={1} />);
    const button = await screen.findByRole("button", { name: "重试" });
    expect(screen.queryByText(/没有更早|没有更新|已经/)).not.toBeInTheDocument();
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(getAdjacentBlogs).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(ready("更早的文章")));
    expect(screen.getByRole("link", { name: /更早的文章/ })).toHaveAttribute("href", "/blog/8");
    expect(screen.getByRole("heading", { name: "相邻文章" })).toHaveFocus();
    expect(screen.getByText("没有更新的文章")).toBeVisible();
  });

  it("ignores first A response after A to B to A", async () => {
    const first = deferred(),
      second = deferred(),
      third = deferred();
    vi.mocked(getAdjacentBlogs)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const { rerender, unmount } = render(<AdjacentBlogs id={1} />);
    rerender(<AdjacentBlogs id={2} />);
    rerender(<AdjacentBlogs id={1} />);
    await act(async () => third.resolve(ready("最新请求")));
    await act(async () => {
      first.resolve(ready("过时 A"));
      second.resolve(ready("过时 B"));
    });
    expect(screen.getByRole("link", { name: /最新请求/ })).toBeVisible();
    expect(screen.queryByText(/过时/)).not.toBeInTheDocument();
    unmount();
  });

  it("handles transport rejection and missing current article without boundary claims", async () => {
    vi.mocked(getAdjacentBlogs)
      .mockRejectedValueOnce(new Error("transport"))
      .mockResolvedValueOnce({ status: "not_found", message: "missing" });
    render(<AdjacentBlogs id={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByText("当前文章已不存在，相邻文章不可用")).toBeVisible();
    expect(screen.queryByText(/没有更早|没有更新/)).not.toBeInTheDocument();
  });

  it.each([
    ["invalid_input", "无法读取此文章的相邻导航"],
    ["not_found", "当前文章已不存在，相邻文章不可用"],
  ] as const)(
    "AC-6, AC-11: explains %s without hiding the article or exposing details",
    async (status, message) => {
      const user = userEvent.setup();
      vi.mocked(getAdjacentBlogs)
        .mockResolvedValueOnce({ status, message: "private database connection detail" })
        .mockResolvedValueOnce(ready("当前文章的真实邻居"));
      render(
        <article>
          <p>当前文章正文保持可读</p>
          <AdjacentBlogs id={1} />
        </article>
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByText("当前文章正文保持可读")).toBeVisible();
      expect(
        screen.queryByText(/private database|没有更早|没有更新|暂无其他/)
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "返回文章列表" })).toHaveAttribute("href", "/blog");
      expect(getAdjacentBlogs).toHaveBeenCalledTimes(1);

      await user.tab();
      expect(screen.getByRole("button", { name: "重试" })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(await screen.findByRole("link", { name: /当前文章的真实邻居/ })).toBeVisible();
      expect(screen.getByText("当前文章正文保持可读")).toBeVisible();
      expect(getAdjacentBlogs).toHaveBeenCalledTimes(2);
    }
  );

  it("AC-6, AC-10: announces loading without claiming either navigation boundary", async () => {
    const pending = deferred();
    vi.mocked(getAdjacentBlogs).mockReturnValueOnce(pending.promise);
    render(<AdjacentBlogs id={1} />);

    expect(screen.getByLabelText("相邻文章")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在读取相邻文章…");
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.queryByText(/没有更早|没有更新|暂无其他/)).not.toBeInTheDocument();

    await act(async () => pending.resolve({ status: "success", data: { prev: null, next: null } }));
    expect(screen.getByLabelText("相邻文章")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("暂无其他文章")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("相邻文章已更新");
  });

  it.each(["success", "rejection"] as const)(
    "AC-7: ignores a pending %s after unmount and remount of the same article",
    async (settlement) => {
      const abandoned = deferred();
      const current = deferred();
      vi.mocked(getAdjacentBlogs)
        .mockReturnValueOnce(abandoned.promise)
        .mockReturnValueOnce(current.promise);
      const previous = render(<AdjacentBlogs id={1} />);
      expect(screen.getByRole("status")).toHaveTextContent("正在读取相邻文章…");
      previous.unmount();
      render(<AdjacentBlogs id={1} />);

      await act(async () => {
        if (settlement === "success") abandoned.resolve(ready("卸载前的旧邻居"));
        else abandoned.reject(new Error("private abandoned transport failure"));
      });
      expect(screen.getByRole("status")).toHaveTextContent("正在读取相邻文章…");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText(/卸载前的旧邻居|private abandoned/)).not.toBeInTheDocument();

      await act(async () => current.resolve(ready("重新挂载后的邻居")));
      expect(screen.getByRole("link", { name: /重新挂载后的邻居/ })).toBeVisible();
      expect(getAdjacentBlogs).toHaveBeenCalledTimes(2);
    }
  );

  it("AC-7: discards a retry result when the article changes while it is pending", async () => {
    const user = userEvent.setup();
    const abandoned = deferred();
    vi.mocked(getAdjacentBlogs)
      .mockResolvedValueOnce({ status: "temporary_failure", message: "" })
      .mockReturnValueOnce(abandoned.promise)
      .mockResolvedValueOnce(ready("新文章的邻居"));
    const { rerender } = render(<AdjacentBlogs id={1} />);
    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在重试相邻文章…");

    rerender(<AdjacentBlogs id={2} />);
    expect(await screen.findByRole("link", { name: /新文章的邻居/ })).toBeVisible();
    await act(async () => abandoned.resolve({ status: "not_found", message: "迟到的文章1失败" }));

    expect(screen.getByRole("link", { name: /新文章的邻居/ })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.mocked(getAdjacentBlogs).mock.calls.map(([id]) => id)).toEqual([1, 1, 2]);
  });

  it("AC-7: ignores the first request when StrictMode restarts the same effect", async () => {
    const first = deferred();
    const current = deferred();
    vi.mocked(getAdjacentBlogs)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(current.promise);
    render(
      <StrictMode>
        <AdjacentBlogs id={1} />
      </StrictMode>
    );

    await act(async () => current.resolve(ready("当前挂载的结果")));
    await act(async () => first.resolve(ready("StrictMode第一次请求的旧结果")));

    expect(screen.getByRole("link", { name: /当前挂载的结果/ })).toBeVisible();
    expect(screen.queryByText(/第一次请求的旧结果/)).not.toBeInTheDocument();
    expect(getAdjacentBlogs).toHaveBeenCalledTimes(2);
  });

  it("AC-7, AC-10: does not take focus back after the user leaves a pending retry", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    vi.mocked(getAdjacentBlogs)
      .mockResolvedValueOnce({ status: "temporary_failure", message: "" })
      .mockReturnValueOnce(pending.promise);
    render(
      <>
        <AdjacentBlogs id={1} />
        <button>继续阅读正文</button>
      </>
    );
    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(screen.getByRole("button", { name: "正在重试…" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "返回文章列表" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "继续阅读正文" })).toHaveFocus();

    await act(async () => pending.resolve(ready("更新后的邻居")));

    expect(screen.getByRole("link", { name: /更新后的邻居/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "继续阅读正文" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "相邻文章" })).not.toHaveFocus();
  });

  it("AC-6, AC-7, AC-10: allows another manual retry after failure and suppresses duplicate keyboard requests", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    vi.mocked(getAdjacentBlogs)
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(ready("最终恢复的邻居"));
    render(<AdjacentBlogs id={1} />);
    await screen.findByRole("button", { name: "重试" });
    await user.tab();
    await user.keyboard("{Enter}{Enter}");
    expect(screen.getByLabelText("相邻文章")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在重试相邻文章…");
    expect(getAdjacentBlogs).toHaveBeenCalledTimes(2);

    await act(async () =>
      pending.resolve({ status: "temporary_failure", message: "private retry detail" })
    );
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法读取相邻文章");
    expect(screen.getByRole("button", { name: "重试" })).toHaveFocus();
    expect(screen.getByLabelText("相邻文章")).toHaveAttribute("aria-busy", "false");
    expect(getAdjacentBlogs).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("link", { name: /最终恢复的邻居/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "相邻文章" })).toHaveFocus();
    expect(getAdjacentBlogs).toHaveBeenCalledTimes(3);
  });
});
