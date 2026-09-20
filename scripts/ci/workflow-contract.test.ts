import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repositoryRoot } from "../database/local-postgres/config";
import { serializeStagingEnvironment } from "./write-staging-environment";
import dotenv from "dotenv";

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("CI and staging workflow contract", () => {
  it("keeps pull request verification secretless and replays PostgreSQL migrations", async () => {
    const workflow = await text(".github/workflows/verify.yml");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("pnpm ci:migrations verify-pr");
    expect(workflow).toContain("pnpm ci:migrations verify-replay");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toMatch(/pull_request_target|workflow_run/);
  });

  it("pins every referenced action to a full commit SHA", async () => {
    const workflows = await Promise.all(
      [
        ".github/workflows/verify.yml",
        ".github/workflows/staging.yml",
        ".github/workflows/release-eligibility.yml",
        ".github/workflows/release-bookkeeping.yml",
      ].map(text)
    );
    for (const workflow of workflows) {
      for (const match of workflow.matchAll(/uses:\s+([^\s@]+)@([^\s#]+)/g)) {
        expect(match[2], `${match[1]} must be pinned`).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it("serializes the whole staging release and refuses arbitrary workflow refs", async () => {
    const workflow = await text(".github/workflows/staging.yml");
    expect(workflow).toContain("group: feline-blog-staging");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("WORKFLOW_REF: ${{ github.ref }}");
    expect(workflow).toContain('"refs/heads/master"');
    expect(workflow).toContain("git rev-parse origin/master");
    expect(workflow).toContain("--prod --skip-domain");
    expect(workflow).toContain("vercel promote");
    expect(workflow).toContain("vercel rollback");
  });

  it("preserves a multiline staging CA in the ephemeral dotenv file", async () => {
    const certificate = [
      "-----BEGIN CERTIFICATE-----",
      "test+/certificate=value",
      "-----END CERTIFICATE-----",
    ].join("\n");
    const serialized = serializeStagingEnvironment({
      POSTGRES_MIGRATION_URL:
        "postgresql://app_migrator:secret@example.test/postgres?sslmode=verify-full",
      POSTGRES_SSL_CA: certificate,
    });

    expect(dotenv.parse(serialized)).toEqual({
      POSTGRES_ENVIRONMENT: "staging",
      POSTGRES_MIGRATION_URL:
        "postgresql://app_migrator:secret@example.test/postgres?sslmode=verify-full",
      POSTGRES_SSL_CA: certificate,
    });

    const workflow = await text(".github/workflows/staging.yml");
    expect(workflow).toContain("pnpm exec tsx ./scripts/ci/write-staging-environment.ts");
    expect(workflow).not.toContain('"POSTGRES_SSL_CA=$POSTGRES_SSL_CA"');
  });

  it("grants OIDC only to the four exact-origin smoke jobs", async () => {
    const workflow = await text(".github/workflows/staging.yml");
    const jobs = workflow.split(/^  (?=[a-z][a-z-]+:)/m).slice(1);
    const oidcJobs = jobs
      .filter((job) => job.includes("id-token: write"))
      .map((job) => job.match(/^([a-z][a-z-]+):/)?.[1]);
    expect(oidcJobs).toEqual([
      "candidate-smoke",
      "candidate-auth-smoke",
      "stable-smoke",
      "recovery-smoke",
    ]);
  });

  it("disables retained browser media and blocks cross-origin token forwarding", async () => {
    const [config, smoke] = await Promise.all([
      text("playwright.staging.config.ts"),
      text("e2e/staging-smoke.spec.ts"),
    ]);
    expect(config).toContain('serviceWorkers: "block"');
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
    expect(smoke).toContain("target.origin !== origin");
    expect(smoke).toContain('route.abort("blockedbyclient")');
    expect(smoke).toContain('"x-vercel-trusted-oidc-idp-token"');
  });

  it("keeps release retries bound to the trusted staging record tuple", async () => {
    const workflow = await text(".github/workflows/release-bookkeeping.yml");
    expect(workflow).toContain("recordKey");
    expect(workflow).toContain("schemaVersion === 1");
    expect(workflow).toContain("staging:verified");
    expect(workflow).not.toContain("npm publish");
  });
});
