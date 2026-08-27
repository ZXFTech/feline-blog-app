import { describe, expect, it } from "vitest";
import { localDateKey, monthUtcRange } from "./month";

describe("pomodoro month boundaries", () => {
  it("AC-6 uses an inclusive local month start and exclusive next month start", () => {
    expect(monthUtcRange(2026, 7, "Asia/Shanghai")).toEqual({
      startUtc: "2026-07-31T16:00:00.000Z",
      endUtc: "2026-08-31T16:00:00.000Z",
    });
  });

  it("AC-6 handles daylight saving changes across a local month", () => {
    expect(monthUtcRange(2026, 10, "America/New_York")).toEqual({
      startUtc: "2026-11-01T04:00:00.000Z",
      endUtc: "2026-12-01T05:00:00.000Z",
    });
  });

  it("AC-6 assigns a UTC instant to the local end date", () => {
    expect(localDateKey("2026-08-31T16:30:00.000Z", "Asia/Shanghai")).toBe(
      "2026-09-01",
    );
    expect(localDateKey("2026-08-31T16:30:00.000Z", "UTC")).toBe("2026-08-31");
  });
});
