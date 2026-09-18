import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Calendar } from "@/components/ui/calendar";

describe("Calendar", () => {
  it("covers: AC-7 selects an enabled day and keeps disabled days inert", async () => {
    const onSelect = vi.fn();
    render(
      <Calendar
        mode="single"
        month={new Date(2026, 8, 1)}
        onSelect={onSelect}
        disabled={new Date(2026, 8, 19)}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /September 18th, 2026/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0]).toEqual(new Date(2026, 8, 18));

    const disabledDay = screen.getByRole("button", { name: /September 19th, 2026/ });
    expect(disabledDay).toBeDisabled();
    await userEvent.click(disabledDay);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("covers: AC-7 navigates between months with accessible controls", async () => {
    const onMonthChange = vi.fn();
    render(
      <Calendar mode="single" defaultMonth={new Date(2026, 8, 1)} onMonthChange={onMonthChange} />
    );

    expect(screen.getByText("September 2026")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 9, 1));
    expect(screen.getByText("October 2026")).toBeVisible();
  });
});
