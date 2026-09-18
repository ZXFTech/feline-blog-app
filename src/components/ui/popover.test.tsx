import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

function ExamplePopover() {
  return (
    <Popover>
      <PopoverTrigger>打开详情</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>清单详情</PopoverTitle>
        <PopoverDescription>查看清单的截止时间</PopoverDescription>
        <button type="button">内部操作</button>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("covers: AC-5 opens from its trigger and closes with Escape", async () => {
    render(<ExamplePopover />);
    const trigger = screen.getByRole("button", { name: "打开详情" });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "清单详情" })).toBeVisible();
    expect(screen.getByText("查看清单的截止时间")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "清单详情" })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("covers: AC-5 opens from the keyboard", async () => {
    render(<ExamplePopover />);
    const trigger = screen.getByRole("button", { name: "打开详情" });
    trigger.focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "清单详情" })).toBeVisible();
  });
});
