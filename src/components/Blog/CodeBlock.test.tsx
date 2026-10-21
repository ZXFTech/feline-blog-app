import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CodeBlock } from "@/components/NotionBlock";

describe("CodeBlock", () => {
  // covers: AC-4, AC-7, AC-8 (selection remains inside the focused code region).
  it.each(["ctrlKey", "metaKey"] as const)(
    "selects only the focused block with %s+A, including its original whitespace",
    (modifier) => {
      const code = "\n\t  const value = '当前块';  \n\n";
      render(
        <>
          <p>外部正文</p>
          <CodeBlock code="other block" />
          <CodeBlock code={code} language="ts" />
        </>
      );
      const block = screen.getAllByRole("region", { name: "代码" })[1];
      block.focus();
      const event = createEvent.keyDown(block, { key: "a", [modifier]: true });
      fireEvent(block, event);
      expect(event.defaultPrevented).toBe(true);
      const selection = document.getSelection();
      expect(selection?.toString()).toBe(code);
      expect(selection?.getRangeAt(0).commonAncestorContainer).toBe(block.querySelector("code"));
      expect(block).toHaveFocus();
      selection?.removeAllRanges();
    }
  );

  it("keeps other shortcuts native and confines select-all for an empty block", () => {
    render(<CodeBlock code="" />);
    const block = screen.getByRole("region", { name: "代码" });
    for (const options of [
      { key: "a" },
      { key: "c", ctrlKey: true },
      { key: "a", ctrlKey: true, altKey: true },
      { key: "a", ctrlKey: true, shiftKey: true },
    ]) {
      const event = createEvent.keyDown(block, options);
      fireEvent(block, event);
      expect(event.defaultPrevented).toBe(false);
    }
    const event = createEvent.keyDown(block, { key: "A", ctrlKey: true });
    fireEvent(block, event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.getSelection()?.toString()).toBe("");
    expect(document.getSelection()?.anchorNode).toBe(block.querySelector("code"));
    document.getSelection()?.removeAllRanges();
  });

  // covers: AC-3, AC-4, AC-5.
  it("preserves every character and contains only code inside pre > code", () => {
    const code = "\n\t  const value = '示例';  \n\n";
    const { container } = render(<CodeBlock code={code} language="TS" />);
    expect(container.querySelector("pre > code")?.textContent).toBe(code);
    expect(container.querySelector("pre button")).toBeNull();
  });

  it.each([
    [undefined, "纯文本"],
    ["made-up+#", "made-up+#（纯文本）"],
    ["c++", "c++"],
    ["c#", "c#"],
  ])("keeps the toolbar for language %s and empty code", (language, label) => {
    const { container } = render(<CodeBlock code="" language={language} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制代码" })).toBeInTheDocument();
    expect(container.querySelectorAll(".blog-code-line-number")).toHaveLength(0);
  });

  it.each([
    ["", 0],
    ["a\n", 1],
    ["a\n\n", 2],
    ["\n", 1],
    ["a\r\nb\r\n", 2],
    ["a\rb\r", 2],
  ])("numbers original logical lines for %j", (code, count) => {
    const { container } = render(<CodeBlock code={code} language="text" />);
    expect(container.querySelectorAll(".blog-code-line-number")).toHaveLength(count);
    expect(container.querySelector("pre > code")?.textContent).toBe(code);
  });

  // covers: AC-5, AC-7.
  it("isolates wrapping and resets it when code changes", () => {
    const { rerender } = render(
      <>
        <CodeBlock code="first" language="ts" />
        <CodeBlock code="second" />
      </>
    );
    const buttons = screen.getAllByRole("button", { name: "自动换行" });
    expect(buttons[0]).toHaveAttribute("data-slot", "button");
    expect(buttons[0]).toHaveAttribute("title", "开启自动换行");
    expect(buttons[0]).toHaveTextContent(/^wrap_text$/);
    fireEvent.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute("title", "关闭自动换行");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
    rerender(
      <>
        <CodeBlock code="first" language="ts" title="真实标题" />
        <CodeBlock code="second" />
      </>
    );
    expect(screen.getAllByRole("button", { name: "自动换行" })[0]).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    rerender(
      <>
        <CodeBlock code="changed" language="ts" />
        <CodeBlock code="second" />
      </>
    );
    expect(screen.getAllByRole("button", { name: "自动换行" })[0]).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("resets wrapping when only the language changes, including a language fallback", async () => {
    const user = userEvent.setup();
    const code = "const value = 'same source';\n";
    const { rerender } = render(<CodeBlock code={code} language="ts" />);
    await user.click(screen.getByRole("button", { name: "自动换行" }));
    expect(screen.getByRole("button", { name: "自动换行" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    rerender(<CodeBlock code={code} language="unknown-language" />);
    expect(screen.getByRole("button", { name: "自动换行" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByText("unknown-language（纯文本）")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "代码" }).querySelector("code")?.textContent).toBe(
      code
    );
  });
});
