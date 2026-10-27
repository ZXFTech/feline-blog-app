const targetKeys = new Set(["kind", "service", "appEnv", "origin", "profile", "databaseGeneration", "databaseHost", "databaseName", "nodeMajor", "opsAdapterVersion", "projectId", "teamId", "secrets", "purpose"]);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const integrationSummary = { version: "feline-integration-v1", ready: true } as const;

export function validateIntegrationRelease(input: { schemaVersion?: unknown; target?: Record<string, unknown>; source?: Record<string, unknown> }) {
  const target = input.target;
  if (input.schemaVersion !== 3 || !record(target) || target.service !== "blog" || target.profile !== "feline-blog" || target.purpose !== "feline-integration" ||
      Object.keys(input).some(key => !["schemaVersion", "releaseId", "source", "target"].includes(key)) || Object.keys(target).some(key => !targetKeys.has(key)) ||
      !record(input.source) || Object.keys(input.source).sort().join() !== "clean,commitSha,inputDigest,repositoryId" ||
      !record(target.secrets) || Object.keys(target.secrets).sort().join() !== "client,grant,ops,session" ||
      Object.values(target.secrets).some(value => !record(value) || Object.keys(value).sort().join() !== "digest,version")) throw Error("INTEGRATION_RELEASE_INVALID");
}
