import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DatabaseTargets {
  composeProject: string;
  composeService: string;
  composeVolume: string;
  loopbackHosts: string[];
  defaultPort: number;
  maintenanceDatabase: string;
  developmentDatabase: string;
  shadowDatabase: string;
  verifyDatabase: string;
  runtimeRole: string;
  migratorRole: string;
  adminRole: string;
  stagingProjectRef: string;
  stagingDatabase: string;
  postgresImage: string;
  postgresMajor: number;
  resolvedFromStagingVersion: string;
}

interface EnvironmentSchema {
  protectedKeys: string[];
  protectedPrefixes: string[];
}

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8")) as T;
}

export const targets = readJson<DatabaseTargets>("config/database-targets.json");
export const environmentSchema = readJson<EnvironmentSchema>("config/database-env.schema.json");
export const composeFile = path.join(repositoryRoot, "compose.local-postgres.yaml");
export const stateDirectory = path.join(repositoryRoot, ".feline-blog");
export const composeEnvironmentFile = path.join(stateDirectory, "local-postgres.env");

export function isProtectedKey(key: string): boolean {
  return (
    environmentSchema.protectedKeys.includes(key) ||
    environmentSchema.protectedPrefixes.some((prefix) => key.startsWith(prefix))
  );
}
