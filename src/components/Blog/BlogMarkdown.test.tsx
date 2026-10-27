import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { BlogMarkdown } from "@/components/Blog/BlogMarkdown";

describe("BlogMarkdown", () => {
  // covers: AC-1, AC-2, AC-3, AC-4, AC-11.
  it("shares heading anchors and GFM structure while keeping code panels outside pre", () => {
    const { container } = render(
      <BlogMarkdown
        content={
          "# 重复标题\n\n# 重复标题\n\n- [x] 完成\n- [ ] 待办\n\n| 表头 |\n| --- |\n| 内容 |\n\n`inline`\n\n```\n  plain\n\n```\n\n```ts\nconst value = 1;\n```"
        }
      />
    );
    expect(screen.getAllByRole("heading").map((heading) => heading.id)).toEqual([
      "重复标题",
      "重复标题-1",
    ]);
    expect(
      screen.getAllByRole("checkbox").every((checkbox) => checkbox.hasAttribute("disabled"))
    ).toBe(true);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container.querySelectorAll("pre")).toHaveLength(2);
    expect(container.querySelectorAll("pre pre, pre button, [node]")).toHaveLength(0);
    expect(container.querySelector("pre > code")?.textContent).toBe("  plain\n\n");
    expect(screen.queryByText("test")).not.toBeInTheDocument();
  });

  it("routes empty, unknown and special language fences through the same toolbar", () => {
    const { container } = render(
      <BlogMarkdown
        content={"```\n```\n\n```made-up+#\n x\n```\n\n```c++\nint x;\n```\n\n    indented\n"}
      />
    );
    expect(screen.getAllByRole("button", { name: "复制代码" })).toHaveLength(4);
    expect(screen.getByText("made-up+#（纯文本）")).toBeInTheDocument();
    expect(screen.getByText("c++")).toBeInTheDocument();
    expect(container.querySelector("pre > code")?.textContent).toBe("");
  });

  it("does not execute raw HTML or unsafe URLs and retains image alt text", () => {
    const { container } = render(
      <BlogMarkdown
        content={
          "<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n![本地样例](/myCat.jpg)"
        }
      />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByRole("img", { name: "本地样例" })).toHaveAttribute("loading", "lazy");
  });

  it("preserves the parser's CRLF code text without further whitespace changes", () => {
    const content = "```ts\r\n\r\n\tconst 文本 = '猫';  \r\n\r\n```\r\n";
    const parsed = render(<ReactMarkdown>{content}</ReactMarkdown>);
    const parsedCode = parsed.container.querySelector("pre > code")?.textContent;
    expect(parsedCode?.replace(/\r\n?/g, "\n")).toBe("\n\tconst 文本 = '猫';  \n\n");
    parsed.unmount();

    const { container } = render(<BlogMarkdown content={content} />);
    expect(container.querySelector("pre > code")?.textContent).toBe(parsedCode);
    expect(container.querySelectorAll(".blog-code-line-number")).toHaveLength(3);
  });

  // covers: AC-10. Async article pages are covered by the real author flow E2E.
  it("renders article text and anchors in the initial server output", () => {
    const html = renderToStaticMarkup(<BlogMarkdown content={"## 服务端正文\n\n公开阅读内容"} />);
    expect(html).toContain('id="服务端正文"');
    expect(html).toContain("公开阅读内容");
  });
});
