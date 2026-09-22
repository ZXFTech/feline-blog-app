import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("defaults to the Album form surface", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>通用对话框</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("dialog", { name: "通用对话框" })).toHaveClass(
      "p-[var(--spacing-panel-inset-comfortable)]",
      "shadow-neu-raised"
    );

    const backdrop = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
      (element) =>
        element.classList.contains("bg-black/10") &&
        element.classList.contains("supports-backdrop-filter:backdrop-blur-xs")
    );
    expect(backdrop).toBeDefined();
  });

  it("uses the Album confirmation surface for display dialogs", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent variant="display">
          <DialogTitle>展示对话框</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("dialog", { name: "展示对话框" })).toHaveClass(
      "ring-1",
      "ring-foreground/10",
      "gap-6"
    );
  });
});
