import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
  existing: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/auth/userAuth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/logger/Logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/db/client", () => ({ default: { $transaction: mocks.transaction } }));
vi.mock("@/lib/checklists/cursor", () => ({
  readChecklistCursor: vi.fn(),
  signChecklistCursor: vi.fn(),
}));
import { addChecklistItem } from "./checklistAction";

const input = {
  checklistId: "8dce63b7-5cda-4398-9167-bfa7f4a9c721",
  itemId: "6dca907f-ea9a-4a24-a8ea-1fa0f23661b0",
  detail: "  新增项目  ",
  parentRevision: 3,
};
const now = new Date("2026-09-23T10:00:00Z");
const tx = {
  $queryRaw: mocks.query,
  checklistItem: {
    findFirst: mocks.existing,
    count: mocks.count,
    aggregate: mocks.aggregate,
    create: mocks.create,
  },
  checklist: { update: mocks.update, findUniqueOrThrow: mocks.read },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ status: "success", data: { id: "owner" } });
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.query
    .mockResolvedValueOnce([{ id: input.checklistId, revision: 3 }])
    .mockResolvedValue([{ now }]);
  mocks.existing.mockResolvedValue(null);
  mocks.count.mockResolvedValue(2);
  mocks.aggregate.mockResolvedValue({ _max: { createdOrder: 8 } });
  mocks.read.mockResolvedValue({
    id: input.checklistId,
    name: "清单",
    themeColor: "#20c997",
    expiresAt: now,
    revision: 4,
    items: [
      {
        id: "old",
        detail: "旧项目",
        createdOrder: 1,
        createdAt: new Date(now.getTime() - 1000),
        confirmedAt: null,
        revision: 1,
      },
      {
        id: input.itemId,
        detail: "新增项目",
        createdOrder: 9,
        createdAt: now,
        confirmedAt: null,
        revision: 1,
      },
    ],
  });
});

describe("addChecklistItem", () => {
  it("requires authentication before accessing the database", async () => {
    mocks.auth.mockResolvedValue({ status: "unauthenticated", message: "请登录" });
    expect((await addChecklistItem(input)).status).toBe("unauthenticated");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["", "   ", "a".repeat(2001)])(
    "rejects invalid detail without writing",
    async (detail) => {
      expect((await addChecklistItem({ ...input, detail })).status).toBe("invalid_input");
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );
  it("does not write when the owned active parent is missing", async () => {
    mocks.query.mockReset().mockResolvedValue([]);
    expect((await addChecklistItem(input)).status).toBe("not_found");
    expect(mocks.query.mock.calls[0][0].values).toContain("owner");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects stale revisions and the 200 active item limit", async () => {
    expect((await addChecklistItem({ ...input, parentRevision: 2 })).status).toBe("conflict");
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.query.mockReset().mockResolvedValue([{ id: input.checklistId, revision: 3 }]);
    mocks.count.mockResolvedValue(200);
    expect((await addChecklistItem(input)).status).toBe("invalid_input");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("normalizes the detail, preserves immutable order and returns newest first", async () => {
    const result = await addChecklistItem(input);
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.data.items.map((item) => item.id)).toEqual([input.itemId, "old"]);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        id: input.itemId,
        checklistId: input.checklistId,
        detail: "新增项目",
        createdOrder: 9,
      },
    });
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("retries an already committed item without duplicating or incrementing revisions", async () => {
    mocks.existing.mockResolvedValue({ detail: "新增项目", deletedAt: null });
    expect((await addChecklistItem({ ...input, parentRevision: 1 })).status).toBe("success");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects a reused identifier with different text", async () => {
    mocks.existing.mockResolvedValue({ detail: "其他内容", deletedAt: null });
    expect((await addChecklistItem(input)).status).toBe("conflict");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reports a transaction failure without reporting success", async () => {
    mocks.transaction.mockRejectedValue(new Error("unavailable"));
    expect((await addChecklistItem(input)).status).toBe("temporary_failure");
  });
});
