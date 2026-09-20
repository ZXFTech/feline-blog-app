import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  hasTodoRoles: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/userAuth", () => ({ hasTodoRoles: mocks.hasTodoRoles }));
vi.mock("@/db/client", () => ({
  default: { todo: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/logger/Logger", () => ({ default: { error: mocks.logError } }));

import { DELETE, GET } from "./route";

const prefix = "e2e-staging-12-1-abcdef0";

describe("staging smoke Todo cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STAGING_SMOKE_API_ENABLED = "true";
    process.env.E2E_USER_ID = "smoke-user";
    process.env.SMOKE_DATA_RETENTION_HOURS = "24";
    mocks.hasTodoRoles.mockResolvedValue({
      status: "success",
      data: { id: "smoke-user" },
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
  });

  it("is unavailable outside the explicitly enabled staging runtime", async () => {
    process.env.STAGING_SMOKE_API_ENABLED = "false";
    const response = await GET(
      new NextRequest(`https://stage.example.com/api/v1/staging-smoke/todos?prefix=${prefix}`)
    );
    expect(response.status).toBe(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("scopes reads to the authenticated synthetic account and exact prefix", async () => {
    await GET(
      new NextRequest(`https://stage.example.com/api/v1/staging-smoke/todos?prefix=${prefix}`)
    );
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "smoke-user", content: { startsWith: prefix } },
        take: 100,
      })
    );
  });

  it("immediately cleans only the recorded ids for the current run", async () => {
    mocks.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    const response = await DELETE(
      new NextRequest("https://stage.example.com/api/v1/staging-smoke/todos", {
        method: "DELETE",
        body: JSON.stringify({ prefix, mode: "current", ids: [10, 11] }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] }, userId: "smoke-user" },
      data: { delete: true },
    });
  });

  it("rejects a current-run cleanup when any recorded id is outside the prefix", async () => {
    mocks.findMany.mockResolvedValue([{ id: 10 }]);
    const response = await DELETE(
      new NextRequest("https://stage.example.com/api/v1/staging-smoke/todos", {
        method: "DELETE",
        body: JSON.stringify({ prefix, mode: "current", ids: [10, 11] }),
      })
    );
    expect(response.status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
