import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TagEditor, { type TagData } from "@/components/TagEditor";
import { parseDraftTags } from "@/lib/blog/draft-validation";

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
      />
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

function Editor() {
  const [tags, setTags] = useState<TagData[]>([]);
  return (
    <>
      <TagEditor defaultOpen value={tags} setValue={setTags} options={[]} />
      <output aria-label="已确认标签">{JSON.stringify(tags)}</output>
    </>
  );
}

describe("tag confirmation", () => {
  it("confirms consecutive tags with a valid inherited color without opening the picker", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    for (const name of ["默认颜色", "另一个默认颜色"]) {
      await user.type(screen.getByLabelText("标签名称"), name);
      await user.click(screen.getByRole("button", { name: "确认标签" }));
    }
    const tags: unknown = JSON.parse(screen.getByLabelText("已确认标签").textContent!);
    expect(parseDraftTags(tags)).toEqual([
      { content: "默认颜色", color: "currentColor" },
      { content: "另一个默认颜色", color: "currentColor" },
    ]);
  });

  it("keeps a pointer selection when reopening, hovering another swatch and dismissing the picker", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.type(screen.getByLabelText("标签名称"), "蓝色标签");
    await user.click(screen.getByRole("button", { name: "选择标签颜色" }));
    await user.click(screen.getByRole("button", { name: "选择 blue-500 颜色" }));
    const selected = screen.getByLabelText("标签名称").getAttribute("style");
    expect(selected).toContain("oklch");
    await user.click(screen.getByRole("button", { name: "选择标签颜色" }));
    await user.hover(screen.getByRole("button", { name: "选择 red-500 颜色" }));
    await user.click(screen.getByLabelText("标签名称"));
    expect(screen.getByLabelText("标签名称")).toHaveFocus();
    expect(screen.getByLabelText("标签名称").getAttribute("style")).toBe(selected);
    await user.click(screen.getByRole("button", { name: "确认标签" }));
    expect(screen.getByLabelText("已确认标签")).toHaveTextContent("oklch(62.3% 0.214 259.815)");
  }, 15_000);
});
