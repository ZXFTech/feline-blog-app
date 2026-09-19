import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Modal from ".";

describe("Modal", () => {
  it("keeps content clicks inside the surface and closes from the mask", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Modal visible onClose={onClose} onOk={vi.fn()} footer="none">
        模态内容
      </Modal>
    );

    await user.click(screen.getByText("模态内容"));
    expect(onClose).not.toHaveBeenCalled();

    const mask = container.ownerDocument.querySelector<HTMLDivElement>(".fixed.inset-0");
    expect(mask).not.toBeNull();
    expect(mask).toHaveClass("bg-black/10", "supports-backdrop-filter:backdrop-blur-xs");

    const panel = container.ownerDocument.querySelector('[data-slot="modal-panel"]');
    expect(panel).toHaveClass(
      "p-[var(--spacing-panel-inset-comfortable)]",
      "gap-[var(--spacing-panel-gap-comfortable)]"
    );
    await user.click(mask!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
