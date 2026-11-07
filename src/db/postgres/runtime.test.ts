// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  createPool: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })), on: vi.fn() },
}));
vi.mock("pg", () => ({
  Pool: function () {
    mocks.createPool();
    return mocks.pool;
  },
}));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: mocks.attach }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../../../generated/prisma-postgres/client", () => ({ PrismaClient: class {} }));
vi.mock("@/lib/auth/sdk/config", () => ({
  getSdkServerConfiguration: () => ({ poolConfig: {}, databaseSchema: "feline_sdk_prod" }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

it("keeps imports inert and registers one suspension lifecycle hook on the reused pool", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { postgresPool } = await import("./runtime");
  expect(mocks.createPool).not.toHaveBeenCalled();
  await postgresPool.query("SELECT 1");
  await postgresPool.query("SELECT 1");
  expect(mocks.createPool).toHaveBeenCalledTimes(1);
  expect(mocks.attach).toHaveBeenCalledExactlyOnceWith(mocks.pool);
  expect(mocks.pool.query).toHaveBeenCalledTimes(2);
});
