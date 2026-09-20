import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import { DatabaseToolError } from "./errors";
import {
  composeEnvironmentFile,
  isProtectedKey,
  repositoryRoot,
  stateDirectory,
  targets,
} from "./config";

export type EnvironmentValues = Record<string, string>;

const processOnlyGates = new Set([
  "STAGING_DATA_COPY_ALLOW",
  "STAGING_DATA_COPY_TRUSTED_WORKSTATION",
  "STAGING_MIGRATION_ALLOW_WRITE",
  "STAGING_ROLE_SETUP_ALLOW_WRITE",
  "LOCAL_DATABASE_DESTROY_ALLOW",
]);

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readEnvironmentFile(relativePath: string): Promise<EnvironmentValues> {
  const filePath = path.join(repositoryRoot, relativePath);
  if (!(await exists(filePath))) {
    throw new DatabaseToolError("CONFIG_CONFLICT", `${relativePath} is required.`);
  }
  const parsed = dotenv.parse(await readFile(filePath));
  for (const gate of processOnlyGates) {
    if (parsed[gate] !== undefined) {
      throw new DatabaseToolError(
        "CONFIG_CONFLICT",
        `${gate} must be set only for the current process.`
      );
    }
  }
  return parsed;
}

export function rejectInheritedProtectedEnvironment(
  environment: NodeJS.ProcessEnv,
  allowedProcessKeys: readonly string[] = []
): void {
  const allowed = new Set(allowedProcessKeys);
  const conflicts = Object.keys(environment).filter(
    (key) => isProtectedKey(key) && !allowed.has(key)
  );
  if (conflicts.length > 0) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      `Protected inherited variables are not allowed: ${conflicts.sort().join(", ")}.`
    );
  }
}

export async function rejectNextEnvironmentOverrides(): Promise<void> {
  const alternateFiles = [".env", ".env.local", ".env.development.local"];
  const conflicts: string[] = [];
  for (const relativePath of alternateFiles) {
    const filePath = path.join(repositoryRoot, relativePath);
    if (!(await exists(filePath))) continue;
    const parsed = dotenv.parse(await readFile(filePath));
    for (const key of Object.keys(parsed)) {
      if (isProtectedKey(key)) conflicts.push(`${relativePath}:${key}`);
    }
  }
  if (conflicts.length > 0) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      `Alternate Next.js environment files contain protected keys: ${conflicts.join(", ")}.`
    );
  }
}

export function cleanChildEnvironment(
  files: readonly EnvironmentValues[],
  processValues: Readonly<Record<string, string | undefined>> = {}
): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const [key, value] of Object.entries(process.env)) {
    if (!isProtectedKey(key)) child[key] = value;
  }
  for (const values of files) {
    for (const [key, value] of Object.entries(values)) child[key] = value;
  }
  for (const [key, value] of Object.entries(processValues)) {
    if (value !== undefined) child[key] = value;
  }
  return child;
}

function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

function connectionUrl(role: string, password: string, database: string, port: number): string {
  const url = new URL("postgresql://127.0.0.1");
  url.username = role;
  url.password = password;
  url.port = String(port);
  url.pathname = `/${database}`;
  return url.toString();
}

export interface LocalCredentials {
  POSTGRES_ADMIN_PASSWORD: string;
  POSTGRES_MIGRATOR_PASSWORD: string;
  POSTGRES_RUNTIME_PASSWORD: string;
  POSTGRES_LOCAL_PORT: string;
}

export async function ensureLocalConfiguration(): Promise<LocalCredentials> {
  await mkdir(stateDirectory, { recursive: true });
  let credentials: LocalCredentials;
  if (await exists(composeEnvironmentFile)) {
    const parsed = dotenv.parse(await readFile(composeEnvironmentFile));
    credentials = {
      POSTGRES_ADMIN_PASSWORD: requireValue(parsed, "POSTGRES_ADMIN_PASSWORD"),
      POSTGRES_MIGRATOR_PASSWORD: requireValue(parsed, "POSTGRES_MIGRATOR_PASSWORD"),
      POSTGRES_RUNTIME_PASSWORD: requireValue(parsed, "POSTGRES_RUNTIME_PASSWORD"),
      POSTGRES_LOCAL_PORT: parsed.POSTGRES_LOCAL_PORT || String(targets.defaultPort),
    };
  } else {
    credentials = {
      POSTGRES_ADMIN_PASSWORD: randomPassword(),
      POSTGRES_MIGRATOR_PASSWORD: randomPassword(),
      POSTGRES_RUNTIME_PASSWORD: randomPassword(),
      POSTGRES_LOCAL_PORT: String(targets.defaultPort),
    };
    await writeFile(
      composeEnvironmentFile,
      Object.entries(credentials)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { encoding: "utf8", mode: 0o600, flag: "wx" }
    );
  }

  await migrateStagingConfigurationIfNeeded();
  const legacyDatabaseUrl = await migrateRootLegacyDatabaseUrl();
  const port = Number(credentials.POSTGRES_LOCAL_PORT);
  const development = {
    POSTGRES_ENVIRONMENT: "local",
    POSTGRES_DATABASE_URL: connectionUrl(
      targets.runtimeRole,
      credentials.POSTGRES_RUNTIME_PASSWORD,
      targets.developmentDatabase,
      port
    ),
    POSTGRES_MIGRATION_URL: connectionUrl(
      targets.migratorRole,
      credentials.POSTGRES_MIGRATOR_PASSWORD,
      targets.developmentDatabase,
      port
    ),
    POSTGRES_LOCAL_PORT: String(port),
    POSTGRES_POOL_MAX: "5",
    POSTGRES_CONNECT_TIMEOUT_MS: "10000",
    POSTGRES_IDLE_TIMEOUT_MS: "10000",
    POSTGRES_QUERY_TIMEOUT_MS: "10000",
    ...(legacyDatabaseUrl ? { DATABASE_URL: legacyDatabaseUrl } : {}),
  };
  const shadow = {
    POSTGRES_ENVIRONMENT: "local",
    POSTGRES_SHADOW_DATABASE_URL: connectionUrl(
      targets.migratorRole,
      credentials.POSTGRES_MIGRATOR_PASSWORD,
      targets.shadowDatabase,
      port
    ),
    POSTGRES_VERIFY_DATABASE_URL: connectionUrl(
      targets.migratorRole,
      credentials.POSTGRES_MIGRATOR_PASSWORD,
      targets.verifyDatabase,
      port
    ),
    POSTGRES_ADMIN_URL: connectionUrl(
      targets.adminRole,
      credentials.POSTGRES_ADMIN_PASSWORD,
      targets.maintenanceDatabase,
      port
    ),
    POSTGRES_COMPOSE_PROJECT: targets.composeProject,
  };
  await writeEnvironmentFile(".env.development", development, ["JWT_SECRET", "DATABASE_URL"]);
  await writeEnvironmentFile(".env.shadow", shadow);
  return credentials;
}

async function migrateRootLegacyDatabaseUrl(): Promise<string | undefined> {
  const rootPath = path.join(repositoryRoot, ".env");
  if (!(await exists(rootPath))) return undefined;
  const values = dotenv.parse(await readFile(rootPath));
  const legacyUrl = values.DATABASE_URL;
  if (!legacyUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(legacyUrl);
  } catch {
    throw new DatabaseToolError("CONFIG_CONFLICT", ".env DATABASE_URL is not valid.");
  }
  if (parsed.protocol !== "mysql:") {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      ".env DATABASE_URL is protected and is not an allowlisted legacy MySQL URL."
    );
  }
  delete values.DATABASE_URL;
  await writeFile(
    rootPath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { encoding: "utf8", mode: 0o600 }
  );
  return legacyUrl;
}

async function migrateStagingConfigurationIfNeeded(): Promise<void> {
  const developmentPath = path.join(repositoryRoot, ".env.development");
  const stagingPath = path.join(repositoryRoot, ".env.staging");
  if (!(await exists(developmentPath))) return;
  const current = dotenv.parse(await readFile(developmentPath));
  if (current.POSTGRES_ENVIRONMENT === "local") return;
  const currentDatabaseUrl = current.POSTGRES_DATABASE_URL;
  if (!currentDatabaseUrl) return;
  const currentHost = new URL(currentDatabaseUrl).hostname.replace(/^\[|\]$/g, "");
  if (targets.loopbackHosts.includes(currentHost)) return;
  if (await exists(stagingPath)) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      ".env.development still selects staging while .env.staging already exists. Reconcile them before starting local PostgreSQL."
    );
  }
  await writeFile(stagingPath, await readFile(developmentPath), { mode: 0o600, flag: "wx" });
}

async function writeEnvironmentFile(
  relativePath: string,
  values: EnvironmentValues,
  preserveKeys: readonly string[] = []
): Promise<void> {
  const filePath = path.join(repositoryRoot, relativePath);
  let preserved: EnvironmentValues = {};
  if (await exists(filePath)) {
    const currentContents = await readFile(filePath);
    const current = dotenv.parse(currentContents);
    if (current.POSTGRES_ENVIRONMENT && current.POSTGRES_ENVIRONMENT !== "local") {
      const stagingPath = path.join(repositoryRoot, ".env.staging");
      const safelyBackedUp =
        relativePath === ".env.development" &&
        (await exists(stagingPath)) &&
        Buffer.compare(currentContents, await readFile(stagingPath)) === 0;
      if (!safelyBackedUp) {
        throw new DatabaseToolError(
          "CONFIG_CONFLICT",
          `${relativePath} is not a local environment file.`
        );
      }
    }
    preserved = Object.fromEntries(
      preserveKeys.flatMap((key) => (current[key] ? [[key, current[key]]] : []))
    );
  }
  const output = { ...values, ...preserved };
  await writeFile(
    filePath,
    Object.entries(output)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { encoding: "utf8", mode: 0o600 }
  );
}

export function requireValue(
  values: Readonly<Record<string, string | undefined>>,
  key: string
): string {
  const value = values[key];
  if (!value) throw new DatabaseToolError("CONFIG_CONFLICT", `${key} is required.`);
  return value;
}
