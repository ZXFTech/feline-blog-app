import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  PomodoroEndReason,
  PomodoroType,
} from "../../../generated/prisma/enums";
import type { PomodoroHistoryRecord } from "@/types/pomodoro";
import PomodoroList from "./PomodoroList";

const record: PomodoroHistoryRecord = {
  id: "record-1",
  eventId: "019d3b54-2e18-7000-8000-000000000001",
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  finished: true,
  startAt: "2026-08-01T00:00:00.000Z",
  endAt: "2026-08-01T00:25:00.000Z",
  durationMs: 1_500_000,
  actualDurationMs: 1_500_000,
  syncStatus: "synced",
};

describe("PomodoroList", () => {
  it("AC-9 explains an empty selected month", () => {
    render(<PomodoroList dataSource={[]} onAdoptServer={vi.fn()} />);

    expect(
      screen.getByText("这个月还没有专注记录，开始一次计时后会显示在这里。"),
    ).toBeVisible();
  });

  it("AC-4 displays the outcome, duration and synchronization state", () => {
    render(<PomodoroList dataSource={[record]} onAdoptServer={vi.fn()} />);

    expect(screen.getByRole("list", { name: "番茄钟历史" })).toBeVisible();
    expect(screen.getByText("已同步")).toBeVisible();
    expect(screen.getByText("目标 25:00")).toBeVisible();
    expect(screen.getByText("实际 25:00")).toBeVisible();
    expect(screen.getByText("完成")).toBeVisible();
    const historyCard = screen.getByText("已同步").closest(".neu-div");
    expect(historyCard).toHaveClass("neu-div");
    expect(historyCard?.className).not.toMatch(
      /neu-interaction-raise|neu-embossed|neu-debossed/,
    );
  });

  it("AC-5 lets the user adopt the first server record after a conflict", async () => {
    const user = userEvent.setup();
    const onAdoptServer = vi.fn();
    render(
      <PomodoroList
        dataSource={[{ ...record, syncStatus: "conflict" }]}
        onAdoptServer={onAdoptServer}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("服务端已保存首次记录");
    await user.click(screen.getByRole("button", { name: "采用服务端记录" }));
    expect(onAdoptServer).toHaveBeenCalledWith(record.eventId);
  });
});
