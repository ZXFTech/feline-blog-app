import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import CalendarDemo from "@/app/album/_components/demos/CalendarDemo";

describe("CalendarDemo", () => {
  it("shows the supported calendar modes on one page", () => {
    render(<CalendarDemo />);

    expect(screen.getByRole("heading", { name: "1. 单选日历 Calendar" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. 多选与范围 Calendar" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "3. 月份导航 Calendar" })).toBeVisible();
    expect(screen.getByRole("region", { name: "交互单选" })).toBeVisible();
    expect(screen.getByRole("region", { name: "多日选择" })).toBeVisible();
    expect(screen.getByRole("region", { name: "日期范围" })).toBeVisible();
  });

  it("keeps selection local and restores the fixed fixture", async () => {
    const user = userEvent.setup();
    render(<CalendarDemo />);
    const sandboxElement = screen.getByTestId("calendar-single-sandbox");
    const sandbox = within(sandboxElement);
    const day = sandboxElement.querySelector<HTMLButtonElement>('[data-day="2026/9/17"]');

    expect(day).not.toBeNull();
    await user.click(day!);
    expect(sandbox.getByText("单选日期：2026-09-17")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "恢复日历样例" }));
    expect(sandbox.getByText("单选日期：2026-09-18")).toBeVisible();
  });

  it("lists every disabled date and updates recurring disabled dates with the visible month", async () => {
    const user = userEvent.setup();
    render(<CalendarDemo />);

    const interactiveCalendar = within(screen.getByRole("region", { name: "交互单选" }));
    expect(
      interactiveCalendar.getByText(
        "日历包含禁用日期：2026-09-05、2026-09-06、2026-09-12、2026-09-13、2026-09-19、2026-09-20、2026-09-26、2026-09-27"
      )
    ).toBeVisible();

    await user.click(interactiveCalendar.getByRole("button", { name: /next month/i }));
    expect(
      interactiveCalendar.getByText(
        "日历包含禁用日期：2026-10-03、2026-10-04、2026-10-10、2026-10-11、2026-10-17、2026-10-18、2026-10-24、2026-10-25、2026-10-31"
      )
    ).toBeVisible();

    const fixedCalendar = within(screen.getByRole("region", { name: "隐藏相邻月份" }));
    expect(fixedCalendar.getByText("日历包含禁用日期：2026-09-09、2026-09-23")).toBeVisible();
  });

  it("renders the fixed representative scenario for theme comparison", () => {
    render(<CalendarDemo compact />);

    const selectedDay = document.querySelector('[data-day="2026/9/18"]');
    expect(selectedDay).toHaveAttribute("data-selected-single", "true");
  });
});
