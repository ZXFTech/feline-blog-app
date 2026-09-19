import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

describe("noli control additions", () => {
  it("groups buttons with native controls and exposes orientation", () => {
    render(
      <ButtonGroup orientation="vertical" aria-label="排序方式">
        <Button>最新</Button>
        <ButtonGroupSeparator orientation="horizontal" />
        <Button>最早</Button>
      </ButtonGroup>
    );

    const group = screen.getByRole("group", { name: "排序方式" });
    expect(group).toHaveAttribute("data-orientation", "vertical");
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("renders button group text through a caller supplied element", () => {
    render(<ButtonGroupText render={<output aria-label="数量" />}>3</ButtonGroupText>);

    const output = screen.getByRole("status", { name: "数量" });
    expect(output).toHaveAttribute("data-slot", "button-group-text");
    expect(output).toHaveTextContent("3");
  });

  it("supports visual and native input sizes without losing native attributes", () => {
    const { rerender } = render(<Input aria-label="标题" size="lg" />);
    let input = screen.getByRole("textbox", { name: "标题" });
    expect(input).toHaveClass("h-11");
    expect(input).toHaveClass("bg-background", "shadow-neu-inset-sm");
    expect(input).not.toHaveAttribute("size");

    rerender(<Input aria-label="标题" size={24} />);
    input = screen.getByRole("textbox", { name: "标题" });
    expect(input).toHaveAttribute("size", "24");
    expect(input).toHaveClass("h-11");
  });

  it("adds input group sizes and button variants while retaining native inputs", () => {
    render(
      <InputGroup size="xl" aria-label="搜索">
        <InputGroupInput aria-label="关键词" />
        <InputGroupButton variant="secondary">查找</InputGroupButton>
      </InputGroup>
    );

    expect(screen.getByRole("group", { name: "搜索" })).toHaveClass(
      "h-12",
      "bg-background",
      "shadow-neu-inset-sm"
    );
    expect(screen.getByRole("textbox", { name: "关键词" })).toHaveAttribute(
      "data-slot",
      "input-group-control"
    );
    expect(screen.getByRole("button", { name: "查找" })).toHaveClass("shadow-neu-raised-sm");
  });

  it("adds noli badge semantic colors and sizes without removing shadcn variants", () => {
    const { rerender } = render(
      <Badge variant="warning" size="sm">
        待处理
      </Badge>
    );

    expect(screen.getByText("待处理")).toHaveAttribute("data-size", "sm");
    expect(screen.getByText("待处理")).toHaveClass(
      "bg-status-warning",
      "items-end",
      "h-6",
      "text-[0.8rem]",
      "font-medium",
      "tracking-[1px]"
    );
    expect(screen.getByText("待处理")).not.toHaveClass("items-center", "items-start");

    rerender(<Badge variant="destructive">失败</Badge>);
    expect(screen.getByText("失败")).toHaveClass("text-destructive");
  });
});
