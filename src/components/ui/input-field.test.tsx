import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { InputField } from "@/components/ui/input-field";

describe("InputField", () => {
  it("clears an uncontrolled value and restores focus", () => {
    const onClear = vi.fn();
    render(
      <InputField aria-label="搜索" clearable defaultValue="这是一段默认文字" onClear={onClear} />
    );

    const input = screen.getByRole("textbox", { name: "搜索" });
    fireEvent.click(screen.getByRole("button", { name: "清空输入" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("covers: AC-6 keeps a controlled value, clear action, and suffix in sync", async () => {
    const onClear = vi.fn();

    function ControlledField() {
      const [value, setValue] = useState("待清除");
      return (
        <InputField
          aria-label="受控搜索"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onClear={() => {
            onClear();
            setValue("");
          }}
          clearable
          suffix="篇"
        />
      );
    }

    render(<ControlledField />);
    const input = screen.getByRole("textbox", { name: "受控搜索" });
    await userEvent.clear(input);
    await userEvent.type(input, "新内容");
    expect(input).toHaveValue("新内容");

    await userEvent.click(screen.getByRole("button", { name: "清空输入" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByText("篇")).toBeVisible();
  });

  it("covers: AC-6 forwards native input attributes, ref, and form values", async () => {
    const inputRef = createRef<HTMLInputElement>();
    const onSubmit = vi.fn<(value: string) => void>();

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget).get("query") as string);
        }}
      >
        <InputField
          aria-label="查询"
          name="query"
          defaultValue="猫"
          prefix="搜索"
          inputRef={inputRef}
          required
        />
        <button type="submit">提交</button>
      </form>
    );

    expect(inputRef.current).toBe(screen.getByRole("textbox", { name: "查询" }));
    expect(screen.getByText("搜索")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(onSubmit).toHaveBeenCalledWith("猫");
  });

  it("covers: AC-6 preserves multiline value changes and disabled state", async () => {
    const onChange = vi.fn();
    render(
      <>
        <InputField multiline aria-label="说明" defaultValue="原内容" onChange={onChange} />
        <InputField aria-label="不可编辑" disabled defaultValue="锁定" />
      </>
    );

    const textarea = screen.getByRole("textbox", { name: "说明" });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "新说明");
    expect(textarea).toHaveValue("新说明");
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "不可编辑" })).toBeDisabled();
  });
});
