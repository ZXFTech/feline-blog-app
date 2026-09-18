import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodoItem from "./TodoItem";

const todo = {
  id: 7,
  content: "整理 Todo 列表",
  finished: false,
  tags: [{ id: 3, content: "布局", color: "var(--primary)" }],
};

describe("TodoItem", () => {
  it("keeps the legacy list row proportions with the current theme tokens", () => {
    render(<TodoItem todo={todo} />);

    const contentButton = screen.getByRole("button", { name: "整理 Todo 列表布局" });
    const statusIcon = screen.getByText("check_box_outline_blank");
    const editButton = screen.getByRole("button", { name: "edit" });
    const deleteButton = screen.getByRole("button", { name: "delete" });

    expect(contentButton).toHaveClass(
      "block!",
      "h-auto!",
      "min-w-0",
      "flex-1",
      "bg-background",
      "shadow-neu-raised"
    );
    expect(contentButton.firstElementChild).toHaveClass("gap-2");
    expect(statusIcon).toHaveStyle({ fontSize: "24px" });
    expect(editButton).toHaveClass("m-1!", "h-auto!", "shadow-neu-raised");
    expect(deleteButton).toHaveClass("m-1!", "h-auto!", "shadow-neu-raised");
  });

  it("preserves complete, edit, and delete interactions", () => {
    const onTodoClick = vi.fn();
    const onTodoUpdate = vi.fn();
    const onTodoDelete = vi.fn();

    render(
      <TodoItem
        todo={todo}
        onTodoClick={onTodoClick}
        onTodoUpdate={onTodoUpdate}
        onTodoDelete={onTodoDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "整理 Todo 列表布局" }));
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    expect(onTodoClick).toHaveBeenCalledWith(todo);
    expect(onTodoUpdate).toHaveBeenCalledWith(todo);
    expect(onTodoDelete).toHaveBeenCalledWith(7);
  });
});
