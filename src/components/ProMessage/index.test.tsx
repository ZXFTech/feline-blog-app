import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toast, Toaster } from ".";

describe("ProMessage", () => {
  afterEach(() => {
    toast.dismiss();
  });

  it("renders a success toast published after the toaster mounts", async () => {
    render(<Toaster />);

    act(() => {
      toast.success("完成提示", { id: "toast-integration-test" });
    });

    expect(await screen.findByText("完成提示")).toBeVisible();
  });
});
