import { describe, expect, it } from "vitest";

import {
  normalizeText,
  parseChecklistWriteInput,
  resolveLocalDateTime,
} from "@/lib/checklists/validation";

describe("checklist validation", () => {
  it("uses ECMAScript trim and NFC normalization", () => {
    expect(normalizeText(" \t\n\u00a0\u3000e\u0301\u3000 ", 10)).toBe("é");
    expect(normalizeText("\t\n\u00a0\u3000", 10)).toBeNull();
  });

  it("resolves local times in IANA zones and chooses the earlier repeated instant", () => {
    expect(resolveLocalDateTime("2026-09-22T09:30", "Asia/Shanghai")?.toISOString()).toBe(
      "2026-09-22T01:30:00.000Z"
    );
    expect(resolveLocalDateTime("2026-11-01T01:30", "America/New_York")?.toISOString()).toBe(
      "2026-11-01T05:30:00.000Z"
    );
    expect(resolveLocalDateTime("2026-03-08T02:30", "America/New_York")).toBeNull();
  });

  it("rejects seconds and validates the resolved instant against server time", () => {
    const base = {
      name: " 发布检查 ",
      themeColor: "#20c997",
      localDateTime: "2026-09-22T09:30",
      timeZone: "Asia/Shanghai",
      items: [{ detail: " 回归测试 " }],
    };
    const parsed = parseChecklistWriteInput(base, new Date("2026-09-22T00:00:00.000Z"));
    expect(parsed).toMatchObject({
      ok: true,
      value: { name: "发布检查", items: [{ detail: "回归测试" }] },
    });
    expect(
      parseChecklistWriteInput({ ...base, localDateTime: "2026-09-22T09:30:00" })
    ).toMatchObject({
      ok: false,
      fields: { expiresAt: expect.any(String) },
    });
  });
});
