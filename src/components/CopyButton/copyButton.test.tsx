import { act, configure, fireEvent, getConfig, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopyButton from "@/components/CopyButton/copyButton";

const defaultAsyncWrapper = getConfig().asyncWrapper;

afterEach(() => {
  configure({ asyncWrapper: defaultAsyncWrapper });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function clipboard(writeText?: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { clipboard: writeText ? { writeText } : undefined });
}

function timedUser() {
  vi.useFakeTimers();
  // RTL's default microtask drain only detects Jest fake timers. Use React act
  // here so userEvent and Vitest share the same deterministic clock.
  configure({ asyncWrapper: async (callback) => act(callback) });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe("CopyButton", () => {
  // covers: AC-4, AC-7, AC-8. Only the clipboard and clock are mocked.
  it("copies exact text with the original copy/check icons and resets success after one second", async () => {
    vi.useFakeTimers();
    let resolveWrite: (() => void) | undefined;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );
    clipboard(write);
    render(<CopyButton code={"\n\tcode  \n"} />);
    const button = screen.getByRole("button", { name: "复制代码" });
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("title", "复制代码");
    expect(button).toHaveTextContent(/^file_copy$/);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(write).toHaveBeenCalledExactlyOnceWith("\n\tcode  \n");
    await act(async () => resolveWrite?.());
    expect(button).toHaveTextContent(/^check$/);
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    act(() => vi.advanceTimersByTime(999));
    expect(button).toHaveTextContent(/^check$/);
    act(() => vi.advanceTimersByTime(1));
    expect(button).toHaveTextContent(/^file_copy$/);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("reports missing or rejected clipboard and allows retry", async () => {
    clipboard();
    const { rerender } = render(<CopyButton code="code" />);
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
    expect(await screen.findByRole("status")).toHaveTextContent("复制失败，请手动选择代码");
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
    clipboard(() => Promise.reject(new Error("denied")));
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("复制失败，请手动选择代码");
    rerender(<CopyButton code="new code" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    clipboard(() => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });

  it("ignores an old write after content changes, including returning to the previous text", async () => {
    let resolveWrite: (() => void) | undefined;
    clipboard(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const { rerender, unmount } = render(<CopyButton code="first" />);
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
    rerender(<CopyButton code="second" />);
    rerender(<CopyButton code="first" />);
    await act(async () => resolveWrite?.());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    unmount();
  });

  it("gives new content a full second of success feedback despite the previous copy timer", async () => {
    const user = timedUser();
    const write = vi.fn(async () => {});
    clipboard(write);
    const { rerender } = render(<CopyButton code="first" />);
    await user.click(screen.getByRole("button", { name: "复制代码" }));
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    act(() => vi.advanceTimersByTime(600));

    rerender(<CopyButton code="second" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "复制代码" }));
    expect(write.mock.calls).toEqual([["first"], ["second"]]);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    act(() => vi.advanceTimersByTime(599));
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it.each(["resolve", "reject"] as const)(
    "leaves no feedback or timer when an unmounted clipboard request later %ss",
    async (outcome) => {
      const user = timedUser();
      let resolveWrite: (() => void) | undefined;
      let rejectWrite: ((reason: Error) => void) | undefined;
      clipboard(
        () =>
          new Promise<void>((resolve, reject) => {
            resolveWrite = resolve;
            rejectWrite = reject;
          })
      );
      const { unmount } = render(<CopyButton code="old content" />);
      await user.click(screen.getByRole("button", { name: "复制代码" }));
      expect(screen.getByRole("button", { name: "复制代码" })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent("复制中");
      unmount();

      // Another mounted control must stay idle when the old promise settles.
      render(<CopyButton code="current content" />);
      await act(async () => {
        if (outcome === "resolve") resolveWrite?.();
        else rejectWrite?.(new Error("Delayed clipboard denial"));
      });
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(screen.getByRole("button", { name: "复制代码" })).toBeEnabled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("cleans up an active success timer when the control unmounts", async () => {
    const user = timedUser();
    clipboard(async () => {});
    const { unmount } = render(<CopyButton code="code" />);
    await user.click(screen.getByRole("button", { name: "复制代码" }));
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
