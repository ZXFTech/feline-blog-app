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
      </Modal>,
    );

    await user.click(screen.getByText("模态内容"));
    expect(onClose).not.toHaveBeenCalled();

    const mask =
      container.ownerDocument.querySelector<HTMLDivElement>(".fixed.inset-0");
    expect(mask).not.toBeNull();
    await user.click(mask!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
