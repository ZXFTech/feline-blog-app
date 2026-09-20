import { describe, expect, it } from "vitest";
import {
  assertFullSha,
  assertSafeMigrationSql,
  canRestoreAlias,
  createCheckpoint,
  normalizeHttpsOrigin,
  reconcileMigrationHistory,
  redactSecrets,
  selectCorrelatedDeployment,
  stagingRecordKey,
} from "./staging-core";

const sha = "a".repeat(40);
const migration = { name: "20260101000000_init", checksum: "abc" };

describe("staging contract", () => {
  it("separates trusted workflow identity from a validated candidate SHA", () => {
    expect(assertFullSha(sha)).toBe(sha);
    expect(() => assertFullSha("abc")).toThrow(/full commit SHA/);
    expect(stagingRecordKey(sha, "12", "2")).toBe(`${sha}:12:2`);
  });

  it("classifies applied, pending, and rolled back migration history", () => {
    expect(
      reconcileMigrationHistory(
        [migration],
        [
          {
            migrationName: migration.name,
            checksum: migration.checksum,
            finishedAt: null,
            rolledBackAt: new Date(),
          },
        ]
      )
    ).toEqual({ applied: [], pending: [migration], rolledBack: [migration.name] });
    expect(
      reconcileMigrationHistory(
        [migration],
        [
          {
            migrationName: migration.name,
            checksum: migration.checksum,
            finishedAt: new Date(),
            rolledBackAt: null,
          },
        ]
      ).applied
    ).toEqual([migration]);
  });

  it.each([
    "DROP TABLE users;",
    "TRUNCATE TABLE todos;",
    "ALTER TABLE todos RENAME COLUMN content TO body;",
    "ALTER TABLE todos ALTER COLUMN content TYPE varchar(20);",
    "DO $$ BEGIN RAISE NOTICE 'x'; END $$;",
  ])("rejects unsafe migration SQL: %s", (sql) => {
    expect(() => assertSafeMigrationSql(sql, migration.name)).toThrow(/rejected|unclassified/);
  });

  it("accepts additive migration SQL", () => {
    expect(() =>
      assertSafeMigrationSql(
        'ALTER TABLE "Todo" ADD COLUMN "note" TEXT; CREATE INDEX "Todo_note_idx" ON "Todo"("note");',
        migration.name
      )
    ).not.toThrow();
  });

  it("fails closed for ambiguous remote state and alias races", () => {
    expect(selectCorrelatedDeployment([])).toBeNull();
    expect(selectCorrelatedDeployment(["one"])).toBe("one");
    expect(() => selectCorrelatedDeployment(["one", "two"])).toThrow(/More than one/);
    expect(() => canRestoreAlias("external", "candidate")).toThrow(/changed outside/);
  });

  it("normalizes exact HTTPS origins and rejects credentials", () => {
    expect(normalizeHttpsOrigin("https://stage.example.com/path").origin).toBe(
      "https://stage.example.com"
    );
    expect(() => normalizeHttpsOrigin("http://stage.example.com")).toThrow(/HTTPS origin/);
    expect(() => normalizeHttpsOrigin("https://user:pass@stage.example.com")).toThrow(
      /HTTPS origin/
    );
  });

  it("creates a complete checkpoint and redacts nested secrets", () => {
    const checkpoint = createCheckpoint({ candidateSha: sha, runId: "8", attempt: "1" });
    expect(Object.keys(checkpoint.phaseStates)).toHaveLength(16);
    expect(
      redactSecrets({ token: "abc", nested: { databaseUrl: "postgres://user:pw@host/db" } })
    ).toEqual({ token: "[redacted]", nested: { databaseUrl: "[redacted]" } });
  });
});
