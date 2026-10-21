import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotionBlock, { type Block } from "@/components/NotionBlock";

function notionCode(code: Block["code"]): Block {
  return {
    id: "code-fixture",
    code,
    heading_1: { rich_text: [] },
    heading_2: { rich_text: [] },
    heading_3: { rich_text: [] },
    paragraph: { rich_text: [] },
    bulleted_list_item: { rich_text: [] },
    numbered_list_item: { rich_text: [] },
    image: { type: "external", external: { url: "" }, file: { url: "" }, caption: [] },
    to_do: { checked: false, rich_text: [] },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Notion code adapter", () => {
  // covers: AC-3, AC-4, AC-8. Rich text chunk boundaries must not insert spaces.
  it("displays and copies adjacent rich text chunks without inserting characters", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const { container } = render(
      NotionBlock.code(
        notionCode({
          caption: [{ plain_text: "真实" }, { plain_text: "标题" }],
          rich_text: [
            { plain_text: "\n\tconst " },
            { plain_text: "文本 = '猫';  " },
            { plain_text: "\n\n" },
          ],
          language: "typescript",
        })
      )
    );
    const source = "\n\tconst 文本 = '猫';  \n\n";
    expect(screen.getByText("真实 标题")).toBeInTheDocument();
    expect(container.querySelector("pre > code")?.textContent).toBe(source);
    await user.click(screen.getByRole("button", { name: "复制代码" }));
    expect(write).toHaveBeenCalledExactlyOnceWith(source);
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
  });

  it("keeps an empty untitled Notion block usable without a placeholder title", () => {
    const { container } = render(
      NotionBlock.code(notionCode({ caption: [], rich_text: [], language: "" }))
    );
    expect(container.querySelector(".blog-code-title")).toBeNull();
    expect(container.querySelector("pre > code")?.textContent).toBe("");
    expect(screen.getByText("纯文本")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制代码" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "自动换行" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
