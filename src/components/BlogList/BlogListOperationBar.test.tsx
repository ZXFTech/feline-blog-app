import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlogListOperationBar } from "@/components/BlogList/BlogListOperationBar";

const routing = vi.hoisted(() => ({
  query: "content=old&orderBy=asc&extra=keep",
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/blog",
  useSearchParams: () => new URLSearchParams(routing.query),
  useRouter: () => ({ replace: routing.replace, push: vi.fn() }),
}));
vi.mock("@/components/Auth/PermissionAccess", () => ({ PermissionAccess: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  routing.query = "content=old&orderBy=asc&extra=keep";
  window.history.replaceState({}, "", `/blog?${routing.query}`);
  routing.replace.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Blog URL controls", () => {
  it("reflects the URL and commits draft plus sort once, cancelling the timer", () => {
    render(<BlogListOperationBar />);
    const input = screen.getByRole("textbox", { name: "搜索正文" });
    expect(input).toHaveValue("old");
    fireEvent.change(input, { target: { value: " new " } });
    fireEvent.click(screen.getByRole("button", { name: "按时间倒序" }));
    act(() => vi.advanceTimersByTime(600));
    expect(routing.replace).toHaveBeenCalledTimes(1);
    expect(routing.replace).toHaveBeenCalledWith("/blog?content=new&orderBy=desc&extra=keep", {
      scroll: false,
    });
  });

  it("clears only content and cannot replay an older search", () => {
    render(<BlogListOperationBar />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索正文" }), {
      target: { value: "pending" },
    });
    fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole("textbox", { name: "搜索正文" })).toHaveValue("");
    expect(routing.replace).toHaveBeenCalledTimes(1);
    expect(routing.replace).toHaveBeenCalledWith("/blog?orderBy=asc&extra=keep", { scroll: false });
  });

  it.each(["newer draft", ""])(
    "AC-7 keeps a newer draft (%j) when the previous search commits",
    (draft) => {
      const { rerender } = render(<BlogListOperationBar />);
      const input = screen.getByRole("textbox", { name: "搜索正文" });
      fireEvent.change(input, { target: { value: "first search" } });
      act(() => vi.advanceTimersByTime(500));
      expect(routing.replace).toHaveBeenCalledTimes(1);

      // The next edit is still debouncing when the first response arrives.
      fireEvent.change(input, { target: { value: draft } });
      act(() => vi.advanceTimersByTime(100));
      routing.query = "content=first+search&orderBy=asc&extra=keep";
      window.history.replaceState({}, "", `/blog?${routing.query}#reading`);
      rerender(<BlogListOperationBar />);
      expect(input).toHaveValue(draft);

      act(() => vi.advanceTimersByTime(400));
      expect(routing.replace).toHaveBeenCalledTimes(2);
      expect(routing.replace).toHaveBeenLastCalledWith(
        draft
          ? "/blog?content=newer+draft&orderBy=asc&extra=keep#reading"
          : "/blog?orderBy=asc&extra=keep#reading",
        { scroll: false }
      );
    }
  );

  it("adopts another destination URL and cancels the draft", () => {
    const { rerender } = render(<BlogListOperationBar />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索正文" }), {
      target: { value: "unsubmitted" },
    });
    routing.query = "content=destination&orderBy=desc";
    window.history.replaceState({}, "", `/blog?${routing.query}`);
    rerender(<BlogListOperationBar />);
    expect(screen.getByRole("textbox", { name: "搜索正文" })).toHaveValue("destination");
    act(() => vi.advanceTimersByTime(600));
    expect(routing.replace).not.toHaveBeenCalled();
  });

  it("AC-7 supersedes a pending navigation when the draft returns to the current URL", () => {
    render(<BlogListOperationBar />);
    const input = screen.getByRole("textbox", { name: "搜索正文" });
    fireEvent.change(input, { target: { value: "first search" } });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.change(input, { target: { value: "old" } });
    act(() => vi.advanceTimersByTime(500));
    expect(routing.replace).toHaveBeenCalledTimes(2);
    expect(routing.replace).toHaveBeenLastCalledWith("/blog?content=old&orderBy=asc&extra=keep", {
      scroll: false,
    });
    expect(input).toHaveValue("old");
  });

  it("cancels pending input for history navigation and unmount", () => {
    const { rerender, unmount } = render(<BlogListOperationBar />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索正文" }), {
      target: { value: "pending" },
    });
    routing.query = "content=history&orderBy=desc";
    window.history.replaceState({}, "", `/blog?${routing.query}`);
    fireEvent(window, new PopStateEvent("popstate"));
    rerender(<BlogListOperationBar />);
    expect(screen.getByRole("textbox", { name: "搜索正文" })).toHaveValue("history");
    act(() => vi.advanceTimersByTime(600));
    expect(routing.replace).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索正文" }), {
      target: { value: "late" },
    });
    unmount();
    act(() => vi.advanceTimersByTime(600));
    expect(routing.replace).not.toHaveBeenCalled();
  });
});
