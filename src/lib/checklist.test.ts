import { describe, expect, it } from "vitest";

import {
  formatDeadline,
  getChecklistState,
  getCountdown,
  getProgress,
  ratioColor,
} from "@/lib/checklist";

describe("checklist helpers", () => {
  it("covers: AC-8 reports progress for empty, partial, and complete lists", () => {
    expect(getProgress({ items: [] })).toEqual({ total: 0, done: 0, ratio: 0 });
    expect(
      getProgress({
        items: [
          { id: "1", label: "一", done: true },
          { id: "2", label: "二", done: false },
        ],
      })
    ).toEqual({ total: 2, done: 1, ratio: 0.5 });
    expect(getChecklistState(2, 2)).toBe("confirmed");
    expect(getChecklistState(1, 2)).toBe("partial");
    expect(getChecklistState(0, 0)).toBe("unconfirmed");
  });

  it("covers: AC-8 clamps progress colors outside the supported ratio", () => {
    expect(ratioColor(-1)).toBe("rgb(255 115 0)");
    expect(ratioColor(0.5)).toBe("rgb(128 157 23)");
    expect(ratioColor(2)).toBe("rgb(0 198 46)");
  });

  it("covers: AC-8 formats countdown boundaries without depending on the clock", () => {
    const now = new Date(2026, 8, 18, 12, 0).getTime();

    expect(getCountdown(now, now)).toEqual({
      expired: true,
      label: "已过期",
      urgent: false,
    });
    expect(getCountdown(now + (3 * 24 + 20) * 60 * 60_000 + 40 * 60_000, now)).toEqual({
      expired: false,
      label: "> 3d",
      urgent: false,
    });
    expect(getCountdown(now + 5 * 60 * 60_000 + 3 * 60_000, now)).toEqual({
      expired: false,
      label: "< 6h",
      urgent: false,
    });
    expect(getCountdown(now + 36 * 60_000, now)).toEqual({
      expired: false,
      label: "36min",
      urgent: false,
    });
    expect(getCountdown(now + 5 * 60_000, now)).toEqual({
      expired: false,
      label: "5min",
      urgent: true,
    });
    expect(getCountdown(now + 500, now).label).toBe("1min");
    expect(getCountdown(now + 10 * 60_000, now).urgent).toBe(false);
    expect(getCountdown(now + 60 * 60_000, now).label).toBe("1h");
    expect(getCountdown(now + 24 * 60 * 60_000, now).label).toBe("1d");
  });

  it("covers: AC-8 formats a local deadline to the minute", () => {
    const deadline = new Date(2026, 8, 18, 7, 5).getTime();

    expect(formatDeadline(deadline)).toBe("2026-09-18 07:05");
  });
});
