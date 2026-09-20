import { describe, expect, it } from "vitest";
import { assertImmutableMigrationChanges, parseNameStatus } from "./migration-check";

describe("migration change guard", () => {
  it("allows only newly added migration files", () => {
    const changes = parseNameStatus(
      "A\0prisma/postgres/migrations/20260101000000_add/migration.sql\0"
    );
    expect(assertImmutableMigrationChanges(changes)).toHaveLength(1);
  });

  it.each(["M", "D", "R100"])('rejects existing migration change status "%s"', (status) => {
    const paths = status.startsWith("R")
      ? ["old/migration.sql", "new/migration.sql"]
      : ["old/migration.sql"];
    expect(() => assertImmutableMigrationChanges([{ status, paths }])).toThrow(/immutable/);
  });
});
