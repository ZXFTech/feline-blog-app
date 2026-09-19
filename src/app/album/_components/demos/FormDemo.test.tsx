import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import FormDemo from "@/app/album/_components/demos/FormDemo";

describe("FormDemo", () => {
  it("groups inputs and checkbox fields on one page", () => {
    render(<FormDemo />);

    expect(
      screen.getByRole("heading", {
        name: "1. 输入控件 Input / InputField / Textarea / InputGroup",
      })
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "2. 复选框与字段 Checkbox / Field / Label" })
    ).toBeVisible();
  });

  it("keeps the checkbox example interactive", async () => {
    const user = userEvent.setup();
    render(<FormDemo />);
    const checkbox = screen.getByRole("checkbox", { name: "纳入展示目录" });

    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
