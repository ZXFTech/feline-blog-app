import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SelectionDemo from "@/app/album/_components/demos/SelectionDemo";

describe("SelectionDemo", () => {
  it("groups Select and Combobox on one page", () => {
    render(<SelectionDemo />);

    expect(screen.getByRole("heading", { name: "1. 固定选择 Select" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. 搜索选择 Combobox" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "默认尺寸角色选择" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "默认尺寸角色选择" })).toHaveTextContent(
      "前端开发"
    );
    expect(screen.getByRole("combobox", { name: "搜索城市" })).toBeVisible();
  });

  it("renders a closed representative scenario for theme comparison", () => {
    render(<SelectionDemo compact />);

    expect(screen.getByRole("combobox", { name: "主题代表角色选择" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "搜索城市" })).toBeVisible();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
