import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyView } from "./WeeklyView";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/daily",
  useRouter: () => ({ replace: navigation.replace }),
}));

describe("WeeklyView", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
  });

  it("renders seven native date buttons and marks the selected date", async () => {
    const selectedDate = new Date("2026-08-24T00:00:00.000Z");
    const { container } = render(
      <WeeklyView
        weeklyStatus={[]}
        selectedDate={selectedDate}
        onWeekChanged={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(
        7,
      );
    });

    const selectedButton = container.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]',
    );
    expect(selectedButton).not.toBeNull();
    expect(
      container.querySelectorAll('button[aria-pressed="true"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('button[aria-pressed="false"]'),
    ).toHaveLength(6);
    expect(selectedButton).toHaveAttribute("type", "button");
    expect(selectedButton).toHaveClass("neu-div", "neu-embossed-normal");
  });

  it("uses native Enter and Space activation with one navigation per action", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WeeklyView
        weeklyStatus={[]}
        selectedDate={new Date("2026-08-24T00:00:00.000Z")}
        onWeekChanged={vi.fn()}
      />,
    );
    const selectedButton = await waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      expect(button).not.toBeNull();
      return button!;
    });

    selectedButton.focus();
    await user.keyboard("{Enter}");
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/daily?date=2026-08-24",
    );
    expect(navigation.replace).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(navigation.replace).toHaveBeenCalledTimes(2);
  });

  it("navigates once to the clicked date", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WeeklyView
        weeklyStatus={[]}
        selectedDate={new Date("2026-08-24T00:00:00.000Z")}
        onWeekChanged={vi.fn()}
      />,
    );

    const buttons = await waitFor(() => {
      const result = container.querySelectorAll<HTMLButtonElement>(
        "button[aria-pressed]",
      );
      expect(result).toHaveLength(7);
      return result;
    });
    await user.click(buttons[0]);

    expect(navigation.replace).toHaveBeenCalledOnce();
    expect(navigation.replace).toHaveBeenCalledWith("/daily?date=2026-08-23");
  });
});
