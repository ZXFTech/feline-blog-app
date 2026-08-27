import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { PomodoroEndReason, PomodoroType } from "../../generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth/userAuth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("./client", () => ({
  default: {
    pomodoroRecord: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      update: mocks.update,
    },
  },
}));

import { getTomatoHistory, savePomodoroRecord } from "./tomatoActions";

const input = {
  eventId: "019d3b54-2e18-7000-8000-000000000001",
  type: PomodoroType.FOCUS,
  endReason: PomodoroEndReason.COMPLETED,
  startAt: "2026-08-01T00:00:00.000Z",
  endAt: "2026-08-01T00:25:00.000Z",
  targetDurationMs: 1_500_000,
  remainingMs: 0,
};

const databaseRecord = {
  id: "record-1",
  eventId: input.eventId,
  type: input.type,
  endReason: input.endReason,
  finished: true,
  startAt: new Date(input.startAt),
  endAt: new Date(input.endAt),
  durationMs: input.targetDurationMs,
  actualDurationMs: input.targetDurationMs,
};

describe("tomatoActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-a" });
    mocks.create.mockResolvedValue(databaseRecord);
  });

  it("AC-7 rejects writes when authentication is missing", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("missing token"));

    await expect(savePomodoroRecord(input)).resolves.toEqual({
      status: "unauthenticated",
      message: "登录状态已失效",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("AC-2 creates a normalized private record for the authenticated user", async () => {
    const result = await savePomodoroRecord(input);

    expect(result).toMatchObject({
      status: "created",
      record: { id: "record-1", syncStatus: "synced" },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-a",
        eventId: input.eventId,
        actualDurationMs: 1_500_000,
      }),
    });
  });

  it.each([
    [{ ...input, eventId: "bad" }, "invalid event id"],
    [{ ...input, remainingMs: -1 }, "negative remaining time"],
    [{ ...input, targetDurationMs: 86_400_001 }, "duration over one day"],
    [{ ...input, endAt: "2026-07-31T23:59:59.999Z" }, "end before start"],
  ])("AC-5 rejects %s", async (invalidInput) => {
    await expect(savePomodoroRecord(invalidInput)).resolves.toMatchObject({
      status: "invalid_payload",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("AC-2 treats an identical unique retry as already saved", async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7.3.0",
      }),
    );
    mocks.findUnique.mockResolvedValue(databaseRecord);

    await expect(savePomodoroRecord(input)).resolves.toMatchObject({
      status: "already_exists",
      record: { id: "record-1" },
    });
  });

  it("AC-5 returns the first server record when a retry conflicts", async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7.3.0",
      }),
    );
    mocks.findUnique.mockResolvedValue({
      ...databaseRecord,
      actualDurationMs: 1_000_000,
    });

    await expect(savePomodoroRecord(input)).resolves.toMatchObject({
      status: "conflict",
      record: { actualDurationMs: 1_000_000 },
    });
  });

  it("AC-9 queries only the authenticated user's exclusive month range in stable order", async () => {
    mocks.findMany.mockResolvedValue([databaseRecord]);

    const result = await getTomatoHistory({
      startUtc: "2026-08-01T00:00:00.000Z",
      endUtc: "2026-09-01T00:00:00.000Z",
    });

    expect(result[0]).toMatchObject({
      startAt: input.startAt,
      endAt: input.endAt,
      syncStatus: "synced",
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-a",
        endAt: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lt: new Date("2026-09-01T00:00:00.000Z"),
        },
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
    });
  });

  it("AC-9 rejects an invalid or empty month range", async () => {
    await expect(
      getTomatoHistory({
        startUtc: "2026-09-01T00:00:00.000Z",
        endUtc: "2026-09-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("月份范围无效");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
