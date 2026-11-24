import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "@/components/MarkdownEditor";

vi.mock("@/db/tagAction", () => ({
  getOptionTagsById: async () => ({ status: "success", data: [] }),
}));

describe("MarkdownEditor preview", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  // covers: AC-2, AC-4, AC-11. Tag options are the only server boundary here.
  it("renders the supplied content with shared anchors, GFM and exact parsed code", async () => {
    const { container } = render(
      <MarkdownEditor
        blog={{
          title: "预览",
          content:
            "## 相同标题\n\n## 相同标题\n\n```\n  plain  \n\n```\n\n| 表头 |\n| --- |\n| 单元格 |",
        }}
        handleSubmit={() => {}}
        onTitleChange={() => {}}
        onContentChange={() => {}}
        onTagChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /预览/ }));
    expect(await screen.findByRole("button", { name: /关闭预览/ })).toBeInTheDocument();
    const preview = container.querySelector(".preview-part .blog-markdown");
    expect(Array.from(preview?.querySelectorAll("h2") ?? [], (node) => node.id)).toEqual([
      "相同标题",
      "相同标题-1",
    ]);
    expect(preview?.querySelector("pre > code")?.textContent).toBe("  plain  \n\n");
    expect(preview?.querySelector("table")).toBeInTheDocument();
    expect(preview?.querySelector("pre button")).toBeNull();
  });

  it("updates an open preview from current content and keeps it current after reopening", async () => {
    const user = userEvent.setup();
    const props = {
      handleSubmit: () => {},
      onTitleChange: () => {},
      onContentChange: () => {},
      onTagChange: () => {},
    };
    const { rerender, container } = render(
      <MarkdownEditor {...props} blog={{ title: "预览", content: "## 旧标题\n\n```\nold\n```" }} />
    );
    await user.click(screen.getByRole("button", { name: /预览/ }));
    expect(screen.getByRole("heading", { name: "旧标题" })).toBeInTheDocument();

    const content = "## 新标题\n\n## 新标题\n\n```ts\n\tnew  \n\n```";
    rerender(<MarkdownEditor {...props} blog={{ title: "预览", content }} />);
    expect(screen.queryByRole("heading", { name: "旧标题" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "新标题" }).map((node) => node.id)).toEqual([
      "新标题",
      "新标题-1",
    ]);
    await user.click(screen.getByRole("button", { name: /关闭预览/ }));
    await user.click(screen.getByRole("button", { name: /预览/ }));
    expect(container.querySelector(".preview-part pre > code")?.textContent).toBe("\tnew  \n\n");
  });

  it("keeps fullscreen when a nested layer has consumed Escape, then lets the next Escape exit", async () => {
    const user = userEvent.setup();
    render(
      <MarkdownEditor
        blog={{ title: "预览", content: "保留正文" }}
        handleSubmit={() => {}}
        onTitleChange={() => {}}
        onContentChange={() => {}}
        onTagChange={() => {}}
      />
    );
    await user.click(screen.getByRole("button", { name: "全屏" }));
    expect(screen.getByRole("dialog", { name: "文章编辑器" })).toBeVisible();
    const consumeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", consumeEscape, true);
    try {
      await user.keyboard("{Escape}");
    } finally {
      document.removeEventListener("keydown", consumeEscape, true);
    }
    expect(screen.getByRole("dialog", { name: "文章编辑器" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "文章编辑器" })).toBeVisible();
  });
});
