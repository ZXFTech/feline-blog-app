import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CombinedBlog } from "@/types/blog";
import ListItem from "./ListItem";

describe("BlogList ListItem", () => {
  it("keeps the decorative raise surface non-interactive", () => {
    const blog = {
      id: 1,
      title: "语义测试文章",
      content: "内容",
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      delete: false,
      authorId: "author-1",
      tags: [],
    } as CombinedBlog;

    const { container } = render(<ListItem {...blog} />);
    const card = screen.getByText("语义测试文章").closest(".blog-list-item");
    expect(card?.tagName).toBe("DIV");
    expect(card).toHaveClass("neu-interaction-raise-normal");
    expect(card).not.toHaveAttribute("role", "button");
    expect(card).not.toHaveAttribute("tabindex");
    expect(container.querySelector(".blog-list-item > a")).toBeNull();
  });
});
