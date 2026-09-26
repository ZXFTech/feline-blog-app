import { describe, expect, it } from "vitest";
import { assertExpectedPendingPrismaStatus } from "./staging";

const migration = "20260920090000_add_checklist_core_loop";

describe("Prisma staging migration probe", () => {
  it("accepts the pending migration output from the failed staging run", () => {
    expect(() =>
      assertExpectedPendingPrismaStatus(
        `4 migrations found in prisma/migrations\nFollowing migration have not yet been applied:\n${migration}\n\nTo apply migrations in production run prisma migrate deploy.`,
        [migration]
      )
    ).not.toThrow();
  });

  it.each([
    ["missing pending marker", `${migration}\n`],
    [
      "different migration",
      "Following migration have not yet been applied:\n20260920090000_other\n",
    ],
    [
      "connection error",
      `Following migration have not yet been applied:\n${migration}\nError: connection failed`,
    ],
  ])("rejects %s", (_reason, output) => {
    expect(() => assertExpectedPendingPrismaStatus(output, [migration])).toThrowError(
      "Prisma migration status did not match the pending migration history."
    );
  });

  it("rejects a nonzero status when the database has no pending migrations", () => {
    expect(() =>
      assertExpectedPendingPrismaStatus(
        `Following migration have not yet been applied:\n${migration}\n`,
        []
      )
    ).toThrowError("Prisma migration status did not match the pending migration history.");
  });
});
