import { describe, expect, it } from "vitest";
import {
  assertDeployment,
  baselineIdentityFromEnvironment,
  correlatedDeployments,
  type VercelTarget,
} from "./vercel-api";

const target: VercelTarget = {
  token: "unused",
  teamId: "team_1",
  projectId: "prj_1",
  projectName: "feline-blog-staging",
};

describe("Vercel deployment validation", () => {
  const baseline = {
    deploymentId: "dpl_baseline1",
    commitSha: "b".repeat(40),
  };

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

  it("accepts the exact trusted baseline when Vercel has no Git metadata", () => {
    expect(
      assertDeployment(
        target,
        {
          id: baseline.deploymentId,
          url: "baseline.example.vercel.app",
          name: target.projectName,
          projectId: target.projectId,
          readyState: "READY",
          target: "production",
        },
        undefined,
        baseline
      )
    ).toMatchObject(baseline);
  });

  it("does not use the baseline SHA for another deployment", () => {
    expect(() =>
      assertDeployment(
        target,
        {
          id: "dpl_other1",
          url: "other.example.vercel.app",
          name: target.projectName,
          projectId: target.projectId,
          readyState: "READY",
          target: "production",
        },
        undefined,
        baseline
      )
    ).toThrow();
  });

  it("rejects baseline metadata that conflicts with the trusted SHA", () => {
    expect(() =>
      assertDeployment(
        target,
        {
          id: baseline.deploymentId,
          url: "baseline.example.vercel.app",
          name: target.projectName,
          projectId: target.projectId,
          readyState: "READY",
          target: "production",
          meta: { githubCommitSha: "c".repeat(40) },
        },
        undefined,
        baseline
      )
    ).toThrow("trusted identity");
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

describe("Vercel baseline configuration", () => {
  it("is optional when neither variable is configured", () => {
    expect(baselineIdentityFromEnvironment({})).toBeUndefined();
  });

  it("accepts a complete baseline identity", () => {
    expect(
      baselineIdentityFromEnvironment({
        STAGING_BASELINE_DEPLOYMENT_ID: "dpl_baseline1",
        STAGING_BASELINE_COMMIT_SHA: "a".repeat(40),
      })
    ).toEqual({ deploymentId: "dpl_baseline1", commitSha: "a".repeat(40) });
  });

  it.each([
    ["missing SHA", { STAGING_BASELINE_DEPLOYMENT_ID: "dpl_baseline1" }],
    ["missing deployment", { STAGING_BASELINE_COMMIT_SHA: "a".repeat(40) }],
    [
      "malformed deployment",
      {
        STAGING_BASELINE_DEPLOYMENT_ID: "baseline1",
        STAGING_BASELINE_COMMIT_SHA: "a".repeat(40),
      },
    ],
    [
      "malformed SHA",
      { STAGING_BASELINE_DEPLOYMENT_ID: "dpl_baseline1", STAGING_BASELINE_COMMIT_SHA: "abc" },
    ],
  ])("rejects %s", (_label, environment) => {
    expect(() => baselineIdentityFromEnvironment(environment)).toThrow();
  });
});
