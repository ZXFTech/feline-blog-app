import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "@/components/ui/checkbox";

describe("Checkbox", () => {
  it("covers: AC-5 toggles with pointer and keyboard input", async () => {
    const onCheckedChange = vi.fn();

    function ControlledCheckbox() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          aria-label="完成"
          checked={checked}
          onCheckedChange={(next) => {
            setChecked(next);
            onCheckedChange(next);
          }}
        />
      );
    }

    render(<ControlledCheckbox />);
    const checkbox = screen.getByRole("checkbox", { name: "完成" });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    checkbox.focus();
    await userEvent.keyboard(" ");
    expect(checkbox).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("covers: AC-5 prevents changes while disabled and exposes invalid state", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        aria-label="不可修改"
        disabled
        aria-invalid="true"
        onCheckedChange={onCheckedChange}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "不可修改" });
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    expect(checkbox).toHaveAttribute("tabindex", "-1");
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(checkbox);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
