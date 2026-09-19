import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function ExampleAlertDialog({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button">删除文章</button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>确认删除</AlertDialogTitle>
        <AlertDialogDescription>删除后无法恢复</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onConfirm}>
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("uses reduced default padding while preserving compact dialog padding", async () => {
    const { rerender } = render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogTitle>默认确认</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByRole("alertdialog", { name: "默认确认" })).toHaveClass(
      "data-[size=default]:p-[var(--spacing-panel-inset-comfortable)]"
    );
    expect(document.querySelector('[data-slot="alert-dialog-overlay"]')).toHaveClass(
      "bg-black/10",
      "supports-backdrop-filter:backdrop-blur-xs"
    );

    rerender(
      <AlertDialog defaultOpen>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>紧凑确认</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByRole("alertdialog", { name: "紧凑确认" })).toHaveClass("data-[size=sm]:p-6");
  });

  it("covers: AC-5 confirms a destructive action exactly once", async () => {
    const onConfirm = vi.fn();
    render(<ExampleAlertDialog onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "删除文章" }));
    expect(screen.getByRole("alertdialog", { name: "确认删除" })).toHaveTextContent(
      "删除后无法恢复"
    );
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("covers: AC-5 cancels without running the destructive action", async () => {
    const onConfirm = vi.fn();
    render(<ExampleAlertDialog onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "删除文章" }));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("button", { name: "删除文章" })).toHaveFocus();
  });
});
