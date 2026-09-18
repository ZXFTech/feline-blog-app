import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "@/components/ui/progress-bar";

describe("ProgressBar", () => {
  it("covers: AC-5 exposes progress semantics and percentage labels", () => {
    render(<ProgressBar value={3} max={4} title="完成度" showLabel="percentage" />);

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "4");
    expect(progress).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("完成度")).toBeVisible();
    expect(screen.getByText("75%")).toBeVisible();
  });

  it("covers: AC-5 clamps its visible percentage while retaining the source value", () => {
    render(<ProgressBar value={12} max={10} showLabel="percentage" />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByText("100%")).toBeVisible();
  });
});
