import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseToolError } from "./errors";
import { withHostLock } from "./lock";

let stateRoot = "";
let originalLocalAppData: string | undefined;
let originalXdgStateHome: string | undefined;

beforeEach(async () => {
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "feline-lock-test-"));
  originalLocalAppData = process.env.LOCALAPPDATA;
  originalXdgStateHome = process.env.XDG_STATE_HOME;
  process.env.LOCALAPPDATA = stateRoot;
  process.env.XDG_STATE_HOME = stateRoot;
});

afterEach(async () => {
  if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalLocalAppData;
  if (originalXdgStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalXdgStateHome;
  await rm(stateRoot, { recursive: true, force: true });
});

describe("withHostLock", () => {
  it("covers: AC-1 and AC-12 serializes conflicting lifecycle operations", async () => {
    let announceAcquired: (() => void) | undefined;
    let releaseHolder: (() => void) | undefined;
    const acquired = new Promise<void>((resolve) => {
      announceAcquired = resolve;
    });
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    const first = withHostLock("first-operation", async () => {
      announceAcquired?.();
      await held;
    });
    await acquired;

    try {
      await expect(withHostLock("second-operation", async () => undefined)).rejects.toMatchObject({
        code: "OWNERSHIP_AMBIGUOUS",
      });
    } finally {
      releaseHolder?.();
      await first;
    }

    const lockDirectory = path.join(stateRoot, "feline-blog", "locks");
    expect(await readdir(lockDirectory)).toEqual([]);
  });

  it("covers: AC-12 releases its owned lock when the protected action fails", async () => {
    await expect(
      withHostLock("failing-operation", async () => {
        throw new DatabaseToolError("RESTORE_FAILED", "fixture failure");
      })
    ).rejects.toThrow("fixture failure");

    await expect(withHostLock("retry-operation", async () => "recovered")).resolves.toBe(
      "recovered"
    );
  });
});
