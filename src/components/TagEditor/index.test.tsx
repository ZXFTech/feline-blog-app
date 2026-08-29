import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TagEditor, { type TagData } from ".";

const option: TagData = { content: "候选标签", color: "green" };

describe("TagEditor", () => {
  it("adds a candidate through the selectable Tag action", async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    render(
      <TagEditor
        value={[]}
        options={[option]}
        setValue={setValue}
        allowCreate={false}
        defaultOpen
      />,
    );

    await user.click(screen.getByRole("button", { name: "候选标签" }));
    expect(setValue).toHaveBeenCalledWith([option]);
  });

  it("removes a selected value through its named close action", async () => {
    const user = userEvent.setup();
    const setValue = vi.fn();
    render(<TagEditor value={[option]} options={[]} setValue={setValue} />);

    await user.click(screen.getByRole("button", { name: "移除候选标签" }));
    expect(setValue).toHaveBeenCalledWith([]);
  });
});
