import {
  assertFullSha,
  hostHash,
  normalizeHttpsOrigin,
  selectCorrelatedDeployment,
  type DeploymentIdentity,
} from "./staging-core";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface VercelDeployment {
  id?: string;
  uid?: string;
  url?: string;
  name?: string;
  projectId?: string;
  state?: string;
  readyState?: string;
  target?: string | null;
  meta?: Record<string, string | number | boolean | null | undefined>;
  createdAt?: number;
}

interface VercelListResponse {
  deployments?: VercelDeployment[];
}

export interface VercelTarget {
  token: string;
  teamId: string;
  projectId: string;
  projectName: string;
}

export interface VercelBaseline {
  deploymentId: string;
  commitSha: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function vercelTargetFromEnvironment(): VercelTarget {
  return {
    token: required("VERCEL_TOKEN"),
    teamId: required("VERCEL_ORG_ID"),
    projectId: required("VERCEL_PROJECT_ID"),
    projectName: required("VERCEL_PROJECT_NAME"),
  };
}

export function baselineIdentityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): VercelBaseline | undefined {
  const deploymentId = environment.STAGING_BASELINE_DEPLOYMENT_ID?.trim();
  const commitSha = environment.STAGING_BASELINE_COMMIT_SHA?.trim();
  if (!deploymentId && !commitSha) return undefined;
  if (!deploymentId || !commitSha) {
    throw new Error("Both staging baseline identity variables are required.");
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error("Staging baseline deployment ID is invalid.");
  }
  return { deploymentId, commitSha: assertFullSha(commitSha) };
}

async function vercelRequest<T>(target: VercelTarget, pathname: string): Promise<T> {
  const url = new URL(pathname, "https://api.vercel.com");
  url.searchParams.set("teamId", target.teamId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${target.token}` },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Vercel request failed with status ${response.status}.`);
  return (await response.json()) as T;
}

export async function getDeployment(
  target: VercelTarget,
  idOrUrl: string
): Promise<VercelDeployment> {
  const lookup = idOrUrl.startsWith("https://") ? new URL(idOrUrl).host : idOrUrl;
  return vercelRequest<VercelDeployment>(target, `/v13/deployments/${encodeURIComponent(lookup)}`);
}

export async function listDeployments(
  target: VercelTarget,
  since: number
): Promise<VercelDeployment[]> {
  const response = await vercelRequest<VercelListResponse>(
    target,
    `/v6/deployments?projectId=${encodeURIComponent(target.projectId)}&since=${since}`
  );
  return response.deployments ?? [];
}

function deploymentId(deployment: VercelDeployment): string {
  const id = deployment.id ?? deployment.uid;
  if (!id) throw new Error("Vercel deployment has no identity.");
  return id;
}

export function assertDeployment(
  target: VercelTarget,
  deployment: VercelDeployment,
  candidateSha?: string,
  baseline?: VercelBaseline
): DeploymentIdentity & { url: string } {
  if (deployment.projectId !== target.projectId || deployment.name !== target.projectName) {
    throw new Error("Vercel deployment belongs to a different project.");
  }
  if (deployment.target !== "production") {
    throw new Error("Vercel deployment is not a Production target.");
  }
  const state = deployment.readyState ?? deployment.state;
  if (state !== "READY") throw new Error("Vercel deployment is not READY.");
  const id = deploymentId(deployment);
  const metadataCommitSha = String(deployment.meta?.githubCommitSha ?? "");
  let commitSha: string;
  if (baseline && id === baseline.deploymentId) {
    commitSha = metadataCommitSha ? assertFullSha(metadataCommitSha) : baseline.commitSha;
    if (commitSha !== baseline.commitSha) {
      throw new Error("Vercel baseline commit metadata does not match the trusted identity.");
    }
  } else {
    commitSha = assertFullSha(metadataCommitSha);
  }
  if (candidateSha && commitSha !== assertFullSha(candidateSha)) {
    throw new Error("Vercel deployment commit does not match the candidate.");
  }
  const rawUrl = deployment.url ?? "";
  const url = normalizeHttpsOrigin(
    rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`
  ).origin;
  return {
    deploymentId: id,
    commitSha,
    hostHash: hostHash(url),
    url,
  };
}

export async function findCorrelatedDeployment(input: {
  target: VercelTarget;
  candidateSha: string;
  runId: string;
  attempt: string;
  recordKey: string;
  since: number;
}): Promise<VercelDeployment | null> {
  const deployments = await listDeployments(input.target, input.since);
  const matches = correlatedDeployments(deployments, input);
  return selectCorrelatedDeployment(matches);
}

export function correlatedDeployments(
  deployments: readonly VercelDeployment[],
  input: Pick<
    Parameters<typeof findCorrelatedDeployment>[0],
    "target" | "candidateSha" | "runId" | "attempt" | "recordKey"
  >
): VercelDeployment[] {
  return deployments.filter(
    (deployment) =>
      deployment.projectId === input.target.projectId &&
      deployment.target === "production" &&
      deployment.meta?.githubCommitSha === input.candidateSha &&
      String(deployment.meta?.felineRunId) === input.runId &&
      String(deployment.meta?.felineRunAttempt) === input.attempt &&
      deployment.meta?.felineRecordKey === input.recordKey
  );
}

async function main(): Promise<void> {
  const target = vercelTargetFromEnvironment();
  const [command, value] = process.argv.slice(2);
  if (command === "inspect" && value) {
    const identity = assertDeployment(
      target,
      await getDeployment(target, value),
      undefined,
      baselineIdentityFromEnvironment()
    );
    process.stdout.write(`${JSON.stringify(identity)}\n`);
    return;
  }
  if (command === "reconcile") {
    const candidateSha = required("CANDIDATE_SHA");
    const runId = required("GITHUB_RUN_ID");
    const attempt = required("GITHUB_RUN_ATTEMPT");
    const recordKey = required("STAGING_RECORD_KEY");
    const since = Number(required("STAGING_RUN_STARTED_AT_MS"));
    const deployment = await findCorrelatedDeployment({
      target,
      candidateSha,
      runId,
      attempt,
      recordKey,
      since,
    });
    process.stdout.write(
      `${JSON.stringify(deployment ? assertDeployment(target, deployment, candidateSha) : null)}\n`
    );
    return;
  }
  throw new Error("Use vercel-api inspect <id-or-url> or reconcile.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write('{"code":"REMOTE_AMBIGUOUS","message":"Vercel identity check failed."}\n');
    process.exitCode = 1;
  });
}
