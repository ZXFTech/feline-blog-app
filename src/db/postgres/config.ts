import type { PoolConfig } from "pg";

const DEFAULT_POOL_MAX = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function assertPostgresUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("POSTGRES_DATABASE_URL is required for the PostgreSQL runtime client.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("POSTGRES_DATABASE_URL must be a valid URL.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("POSTGRES_DATABASE_URL must use the postgresql:// or postgres:// protocol.");
  }

  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "disable" || sslMode === "no-verify") {
    throw new Error("POSTGRES_DATABASE_URL must not disable TLS verification.");
  }

  return value;
}

export function buildPostgresPoolConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): PoolConfig {
  const connectionString = assertPostgresUrl(environment.POSTGRES_DATABASE_URL);
  const sslCa = environment.POSTGRES_SSL_CA?.replace(/\\n/g, "\n");
  if (!sslCa) {
    throw new Error("POSTGRES_SSL_CA is required for PostgreSQL certificate verification.");
  }
  const parsedUrl = new URL(connectionString);
  const hasUrlSslOptions = ["sslmode", "sslcert", "sslkey", "sslrootcert"].some((name) =>
    parsedUrl.searchParams.has(name)
  );

  if (hasUrlSslOptions) {
    throw new Error(
      "POSTGRES_SSL_CA cannot be combined with SSL parameters in POSTGRES_DATABASE_URL."
    );
  }

  return {
    connectionString,
    max: parsePositiveInteger("POSTGRES_POOL_MAX", environment.POSTGRES_POOL_MAX, DEFAULT_POOL_MAX),
    connectionTimeoutMillis: parsePositiveInteger(
      "POSTGRES_CONNECT_TIMEOUT_MS",
      environment.POSTGRES_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS
    ),
    idleTimeoutMillis: parsePositiveInteger(
      "POSTGRES_IDLE_TIMEOUT_MS",
      environment.POSTGRES_IDLE_TIMEOUT_MS,
      DEFAULT_IDLE_TIMEOUT_MS
    ),
    query_timeout: parsePositiveInteger(
      "POSTGRES_QUERY_TIMEOUT_MS",
      environment.POSTGRES_QUERY_TIMEOUT_MS,
      DEFAULT_QUERY_TIMEOUT_MS
    ),
    ssl: { ca: sslCa, rejectUnauthorized: true },
  };
}
