import { describe, expect, it } from "vitest";
import { assertDeployment, correlatedDeployments, type VercelTarget } from "./vercel-api";

const target: VercelTarget = {
  token: "unused",
  teamId: "team_1",
  projectId: "prj_1",
  projectName: "feline-blog-staging",
};

describe("Vercel deployment validation", () => {
  it("accepts the exact READY Production candidate", () => {
    expect(
      assertDeployment(
        target,
        {
          id: "dpl_1",
          url: "candidate.example.vercel.app",
          name: target.projectName,
          projectId: target.projectId,
          readyState: "READY",
          target: "production",
          meta: { githubCommitSha: "a".repeat(40) },
        },
        "a".repeat(40)
      )
    ).toMatchObject({ deploymentId: "dpl_1", commitSha: "a".repeat(40) });
  });

  it.each([
    ["wrong project", { projectId: "other" }],
    ["wrong target", { target: "preview" }],
    ["not ready", { readyState: "ERROR" }],
    ["wrong commit", { meta: { githubCommitSha: "b".repeat(40) } }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      assertDeployment(
        target,
        {
          id: "dpl_1",
          url: "candidate.example.vercel.app",
          name: target.projectName,
          projectId: target.projectId,
          readyState: "READY",
          target: "production",
          meta: { githubCommitSha: "a".repeat(40) },
          ...override,
        },
        "a".repeat(40)
      )
    ).toThrow();
  });

  it("reconciles a timeout only through all correlation fields", () => {
    const exact = {
      id: "dpl_exact",
      projectId: target.projectId,
      target: "production",
      meta: {
        githubCommitSha: "a".repeat(40),
        felineRunId: "12",
        felineRunAttempt: "2",
        felineRecordKey: `${"a".repeat(40)}:12:2`,
      },
    };
    const nearMiss = { ...exact, id: "dpl_wrong", meta: { ...exact.meta, felineRunAttempt: "1" } };
    expect(
      correlatedDeployments([nearMiss, exact], {
        target,
        candidateSha: "a".repeat(40),
        runId: "12",
        attempt: "2",
        recordKey: `${"a".repeat(40)}:12:2`,
      })
    ).toEqual([exact]);
  });
});
