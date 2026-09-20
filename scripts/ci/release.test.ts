import { describe, expect, it } from "vitest";
import { parseFirstChangelogVersion, selectReleasePullRequest } from "./release";

describe("release contract", () => {
  it("reads only the first semantic changelog version", () => {
    expect(parseFirstChangelogVersion("# Changelog\n\n## [0.2.0]\n\n## 0.1.0\n")).toBe("0.2.0");
  });

  it("selects one trusted Release Please merge", () => {
    const sha = "a".repeat(40);
    expect(
      selectReleasePullRequest(
        [
          {
            number: 7,
            merge_commit_sha: sha,
            merged_at: "2026-09-20T00:00:00Z",
            base: { ref: "master" },
            user: { login: "release-app[bot]" },
            labels: [{ name: "autorelease: pending" }],
          },
        ],
        sha,
        "release-app[bot]"
      ).number
    ).toBe(7);
  });

  it("fails closed for zero or multiple trusted release pull requests", () => {
    expect(() => selectReleasePullRequest([], "a".repeat(40), "app[bot]")).toThrow(/exactly one/);
  });
});
