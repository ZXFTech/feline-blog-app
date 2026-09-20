import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repositoryRoot } from "../database/local-postgres/config";
import { assertFullSha, StagingContractError } from "./staging-core";

interface PullRequest {
  number: number;
  merge_commit_sha: string | null;
  merged_at: string | null;
  base?: { ref?: string };
  user?: { login?: string };
  labels?: Array<{ name?: string }>;
}

interface GitReference {
  object?: { sha?: string };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseFirstChangelogVersion(changelog: string): string | null {
  const match = changelog.match(/^## \[?v?(\d+\.\d+\.\d+)\]?/m);
  return match?.[1] ?? null;
}

export async function committedVersion(): Promise<string> {
  const packageFile = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8")
  ) as { version?: string };
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, ".release-please-manifest.json"), "utf8")
  ) as Record<string, string>;
  const changelog = await readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8");
  const changelogVersion = parseFirstChangelogVersion(changelog);
  if (
    !packageFile.version ||
    !/^\d+\.\d+\.\d+$/.test(packageFile.version) ||
    manifest["."] !== packageFile.version ||
    changelogVersion !== packageFile.version
  ) {
    throw new StagingContractError(
      "RELEASE_COLLISION",
      "Package, manifest, and changelog versions do not match."
    );
  }
  return packageFile.version;
}

async function githubRequest<T>(pathname: string, init: RequestInit = {}): Promise<T | null> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${required("GITHUB_TOKEN")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}.`);
  if (response.status === 204) return null;
  return (await response.json()) as T;
}

export function selectReleasePullRequest(
  pullRequests: readonly PullRequest[],
  candidateSha: string,
  appLogin: string
): PullRequest {
  const matches = matchingReleasePullRequests(pullRequests, candidateSha, appLogin);
  if (matches.length !== 1) {
    throw new StagingContractError(
      "RELEASE_COLLISION",
      "Expected exactly one trusted merged Release Please pull request."
    );
  }
  return matches[0] as PullRequest;
}

export function matchingReleasePullRequests(
  pullRequests: readonly PullRequest[],
  candidateSha: string,
  appLogin: string
): PullRequest[] {
  return pullRequests.filter(
    (pullRequest) =>
      pullRequest.merged_at &&
      pullRequest.merge_commit_sha === candidateSha &&
      pullRequest.base?.ref === "master" &&
      pullRequest.user?.login === appLogin &&
      pullRequest.labels?.some(({ name }) => name === "autorelease: pending")
  );
}

async function finalizeRelease(): Promise<void> {
  const repository = required("GITHUB_REPOSITORY");
  const candidateSha = assertFullSha(required("CANDIDATE_SHA"));
  const appLogin = required("RELEASE_APP_LOGIN");
  const pullRequests =
    (await githubRequest<PullRequest[]>(`/repos/${repository}/commits/${candidateSha}/pulls`)) ??
    [];
  selectReleasePullRequest(pullRequests, candidateSha, appLogin);

  const version = await committedVersion();
  const tag = `v${version}`;
  const existingRef = await githubRequest<GitReference>(
    `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`
  );
  if (existingRef?.object?.sha && existingRef.object.sha !== candidateSha) {
    throw new StagingContractError("RELEASE_COLLISION", `Tag ${tag} points to another commit.`);
  }
  if (!existingRef) {
    await githubRequest(`/repos/${repository}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: candidateSha }),
    });
  }

  const existingRelease = await githubRequest<{ target_commitish?: string }>(
    `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`
  );
  if (existingRelease?.target_commitish && existingRelease.target_commitish !== candidateSha) {
    throw new StagingContractError(
      "RELEASE_COLLISION",
      `GitHub Release ${tag} points to another commit.`
    );
  }
  if (!existingRelease) {
    await githubRequest(`/repos/${repository}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: candidateSha,
        name: tag,
        generate_release_notes: false,
        body: `Release ${tag}. See CHANGELOG.md for details.`,
        draft: false,
        prerelease: false,
      }),
    });
  }
  process.stdout.write(`${JSON.stringify({ tag, candidateSha })}\n`);
}

async function releaseEligibility(): Promise<void> {
  const repository = required("GITHUB_REPOSITORY");
  const candidateSha = assertFullSha(required("CANDIDATE_SHA"));
  const appLogin = required("RELEASE_APP_LOGIN");
  const pullRequests =
    (await githubRequest<PullRequest[]>(`/repos/${repository}/commits/${candidateSha}/pulls`)) ??
    [];
  const matches = matchingReleasePullRequests(pullRequests, candidateSha, appLogin);
  if (matches.length > 1) {
    throw new StagingContractError(
      "RELEASE_COLLISION",
      "More than one trusted Release Please pull request matches the candidate."
    );
  }
  process.stdout.write(matches.length === 1 ? "true\n" : "false\n");
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  if (command === "version") {
    process.stdout.write(`${await committedVersion()}\n`);
    return;
  }
  if (command === "finalize") {
    await finalizeRelease();
    return;
  }
  if (command === "eligible") {
    await releaseEligibility();
    return;
  }
  throw new Error("Use release version, eligible, or finalize.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const code = error instanceof StagingContractError ? error.code : "RELEASE_COLLISION";
    process.stderr.write(`${JSON.stringify({ code, message: "Release bookkeeping failed." })}\n`);
    process.exitCode = 1;
  });
}
