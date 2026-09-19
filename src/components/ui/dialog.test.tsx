import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("matches the Todo modal mask and uses reduced content padding", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>通用对话框</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("dialog", { name: "通用对话框" })).toHaveClass(
      "p-[var(--spacing-panel-inset-comfortable)]"
    );

    const backdrop = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
      (element) =>
        element.classList.contains("bg-black/10") &&
        element.classList.contains("supports-backdrop-filter:backdrop-blur-xs")
    );
    expect(backdrop).toBeDefined();
  });
});
