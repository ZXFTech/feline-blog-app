import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ purge: vi.fn() }));

vi.mock("@/db/checklistAction", () => ({ purgeExpiredChecklistTrash: mocks.purge }));
vi.mock("@/lib/logger/Logger", () => ({ default: { error: vi.fn() } }));

import { GET, maxDuration } from "@/app/api/cron/checklists/purge/route";

function request(secret?: string) {
  return new NextRequest("http://localhost/api/cron/checklists/purge", {
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

describe("checklist purge cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the secret is missing or wrong", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request("cron-test-secret"))).status).toBe(401);
    process.env.CRON_SECRET = "cron-test-secret";
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(maxDuration).toBe(60);
  });

  it("retries only retryable database failures", async () => {
    vi.useFakeTimers();
    mocks.purge
      .mockRejectedValueOnce(Object.assign(new Error("serialization"), { code: "P2034" }))
      .mockResolvedValueOnce({ deleted: 2, hasMore: false });

    const responsePromise = GET(request("cron-test-secret"));
    await vi.advanceTimersByTimeAsync(50);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(mocks.purge).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable failures", async () => {
    mocks.purge.mockRejectedValueOnce(Object.assign(new Error("bad query"), { code: "P2000" }));
    expect((await GET(request("cron-test-secret"))).status).toBe(503);
    expect(mocks.purge).toHaveBeenCalledOnce();
  });
});
