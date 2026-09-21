import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { targets } from "./config";
import {
  assertPrivatePrestateFile,
  decideConfigureTimeoutTransition,
  decideRollbackTimeoutTransition,
  desiredTimeoutExplicitState,
  parseTimeoutMilliseconds,
  parseTimeoutPrestate,
  securePrivatePrestateFile,
  type TimeoutExplicitState,
} from "./staging-timeouts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function prestate(explicit: TimeoutExplicitState) {
  return JSON.stringify({
    schemaVersion: 1,
    projectRef: targets.stagingProjectRef,
    database: targets.stagingDatabase,
    role: targets.migratorRole,
    capturedAt: "2026-09-20T00:00:00.000Z",
    explicit,
    effectiveMs: { lockTimeoutMs: 0, statementTimeoutMs: 0 },
  });
}

describe("staging migrator timeout state", () => {
  it.each([
    ["5000ms", 5_000],
    ["5s", 5_000],
    ["2min", 120_000],
    ["0", 0],
  ])("covers: AC-15 normalizes %s to milliseconds", (value, milliseconds) => {
    expect(parseTimeoutMilliseconds(value)).toBe(milliseconds);
  });

  it.each(["-1s", "5 seconds", "SET statement_timeout=0", "Infinity"])(
    "covers: AC-14 rejects unsafe timeout value %s",
    (value) => {
      expect(() => parseTimeoutMilliseconds(value)).toThrow("not allowlisted");
    }
  );

  it("covers: AC-14 configure can resume before or after its committed role change", () => {
    const original = { lockTimeout: null, statementTimeout: null };
    expect(decideConfigureTimeoutTransition(original, original)).toBe("apply");
    expect(decideConfigureTimeoutTransition(desiredTimeoutExplicitState(), original)).toBe(
      "verify"
    );
  });

  it("covers: AC-14 configure rejects a third state instead of overwriting drift", () => {
    expect(() =>
      decideConfigureTimeoutTransition(
        { lockTimeout: "9s", statementTimeout: "120s" },
        { lockTimeout: null, statementTimeout: null }
      )
    ).toThrow("have drifted");
  });

  it.each<TimeoutExplicitState>([
    { lockTimeout: null, statementTimeout: null },
    { lockTimeout: null, statementTimeout: "45s" },
    { lockTimeout: "1s", statementTimeout: "45s" },
  ])("covers: AC-14 rollback handles explicit and absent prestate %#", (original) => {
    expect(decideRollbackTimeoutTransition(desiredTimeoutExplicitState(), original)).toBe("apply");
    expect(decideRollbackTimeoutTransition(original, original)).toBe("verify");
  });

  it("covers: AC-14 validates prestate identity and exact fields", () => {
    expect(
      parseTimeoutPrestate(prestate({ lockTimeout: null, statementTimeout: null }))
    ).toMatchObject({
      projectRef: targets.stagingProjectRef,
      explicit: { lockTimeout: null, statementTimeout: null },
      effectiveMs: { lockTimeoutMs: 0, statementTimeoutMs: 0 },
    });
    const parsed = JSON.parse(prestate({ lockTimeout: null, statementTimeout: null }));
    parsed.projectRef = "wrong-project";
    expect(() => parseTimeoutPrestate(JSON.stringify(parsed))).toThrow("not allowlisted");
    parsed.projectRef = targets.stagingProjectRef;
    parsed.unexpected = true;
    expect(() => parseTimeoutPrestate(JSON.stringify(parsed))).toThrow("unexpected shape");
  });

  it("covers: AC-14 secures the local prestate file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "feline-timeout-test-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "prestate.json");
    await writeFile(filePath, "{}", { mode: 0o666 });

    await expect(securePrivatePrestateFile(filePath)).resolves.toBeUndefined();
    await expect(assertPrivatePrestateFile(filePath)).resolves.toBeUndefined();
  });
});
