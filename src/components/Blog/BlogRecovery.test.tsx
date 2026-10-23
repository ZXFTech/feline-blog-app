import { Suspense, use, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlogRecovery } from "@/components/Blog/BlogRecovery";
import BlogError from "@/app/blog/error";
import BlogLoading from "@/app/blog/loading";

const routing = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routing }));
beforeEach(() => routing.refresh.mockReset());

describe("Blog route recovery", () => {
  it.each([false, true])("refreshes once and respects moved focus (%s)", async (movedFocus) => {
    let resolve!: (value: string) => void;
    const data = new Promise<string>((done) => {
      resolve = done;
    });
    function Result() {
      return (
        <h1 data-blog-result-title="" tabIndex={-1}>
          {use(data)}
        </h1>
      );
    }
    function Harness() {
      const [requested, setRequested] = useState(false);
      routing.refresh.mockImplementation(() => setRequested(true));
      return (
        <>
          <Suspense fallback={<p>等待</p>}>{requested ? <Result /> : <BlogRecovery />}</Suspense>
          <button>其他操作</button>
        </>
      );
    }
    window.history.replaceState({}, "", "/blog?content=term&orderBy=asc#section");
    const address = window.location.href;
    render(<Harness />);
    const retry = screen.getByRole("button", { name: "重试" });
    retry.focus();
    await act(async () => {
      fireEvent.click(retry);
      fireEvent.click(retry);
    });
    expect(routing.refresh).toHaveBeenCalledTimes(1);
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("正在重新读取当前页面")).toBeVisible();
    if (movedFocus) screen.getByRole("button", { name: "其他操作" }).focus();
    await act(async () => resolve("文章已恢复"));
    await waitFor(() =>
      expect(
        movedFocus
          ? screen.getByRole("button", { name: "其他操作" })
          : screen.getByRole("heading", { name: "文章已恢复" })
      ).toHaveFocus()
    );
    expect(window.location.href).toBe(address);
  });

  it("uses the framework retry callback and never displays the original exception", () => {
    const retry = vi.fn();
    render(<BlogError error={new Error("internal connection secret")} retry={retry} />);
    expect(screen.getByRole("heading", { name: "Blog 页面暂时无法加载" })).toBeVisible();
    expect(screen.queryByText(/internal connection/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(routing.refresh).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "AC-7, AC-8, AC-10: keeps a framework retry pending and respects moved focus (%s)",
    async (movedFocus) => {
      const user = userEvent.setup();
      let resolve!: (value: string) => void;
      const result = new Promise<string>((done) => {
        resolve = done;
      });
      const frameworkRetry = vi.fn();
      function Recovered() {
        return (
          <h1 tabIndex={-1} data-blog-result-title="">
            {use(result)}
          </h1>
        );
      }
      function Route() {
        const [retrying, setRetrying] = useState(false);
        frameworkRetry.mockImplementation(() => setRetrying(true));
        return (
          <>
            <Suspense fallback={<p>路由正在等待</p>}>
              {retrying ? (
                <Recovered />
              ) : (
                <BlogError error={new Error("private render failure")} retry={frameworkRetry} />
              )}
            </Suspense>
            <button>保留焦点的其他操作</button>
          </>
        );
      }
      window.history.replaceState({}, "", "/blog/new?extra=keep#form");
      const address = window.location.href;
      render(<Route />);

      await user.tab();
      expect(screen.getByRole("button", { name: "重试" })).toHaveFocus();
      await act(async () => {
        await user.keyboard("{Enter}{Enter}");
      });
      expect(frameworkRetry).toHaveBeenCalledTimes(1);
      expect(routing.refresh).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "正在重新读取…" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
      expect(screen.getByRole("status")).toHaveTextContent("正在重新读取当前页面");
      expect(screen.getByRole("heading", { name: "Blog 页面暂时无法加载" })).toBeVisible();
      if (movedFocus) {
        await user.tab();
        await user.tab();
        expect(screen.getByRole("button", { name: "保留焦点的其他操作" })).toHaveFocus();
      }

      await act(async () => resolve("框架重新读取后的结果"));

      expect(await screen.findByRole("heading", { name: "框架重新读取后的结果" })).toBeVisible();
      await waitFor(() =>
        expect(
          movedFocus
            ? screen.getByRole("button", { name: "保留焦点的其他操作" })
            : screen.getByRole("heading", { name: "框架重新读取后的结果" })
        ).toHaveFocus()
      );
      expect(window.location.href).toBe(address);
      expect(screen.queryByText(/private render failure/)).not.toBeInTheDocument();
    }
  );

  it("AC-8, AC-11: keeps repeated route failures safe and waits for another explicit retry", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { rerender } = render(
      <BlogError error={new Error("private first failure")} retry={retry} />
    );
    expect(retry).not.toHaveBeenCalled();

    await user.tab();
    await user.keyboard("{Enter}");
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<BlogError error={new Error("private repeated failure")} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Blog 页面暂时无法加载" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("页面遇到了意外问题");
    expect(screen.getByRole("link", { name: "返回文章列表" })).toHaveAttribute("href", "/blog");
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
    expect(retry).toHaveBeenCalledTimes(1);
    await user.keyboard("{Enter}");
    expect(retry).toHaveBeenCalledTimes(2);
    expect(routing.refresh).not.toHaveBeenCalled();
  });

  it("AC-8, AC-10: exposes shared Chinese loading status and hides decorative skeletons", () => {
    const { container } = render(<BlogLoading />);

    const title = screen.getByRole("heading", { level: 1, name: "正在加载 Blog" });
    expect(title).toBeVisible();
    expect(title.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在加载文章内容…");
    expect(screen.getByText("正在读取页面，请稍候。")).toBeVisible();
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(routing.refresh).not.toHaveBeenCalled();
  });
});
