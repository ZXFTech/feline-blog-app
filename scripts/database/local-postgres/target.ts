import { createHash } from "node:crypto";
import { DatabaseToolError } from "./errors";
import { targets } from "./config";

export interface RedactedTarget {
  targetClass: "local" | "staging";
  redactedHost: string;
  port: number;
  database: string;
  roleClass: string;
  tlsMode: "local-plaintext" | "verify-full";
}

function parsedPostgresUrl(value: string, key: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DatabaseToolError("CONFIG_CONFLICT", `${key} must be a valid URL.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DatabaseToolError("CONFIG_CONFLICT", `${key} must use PostgreSQL.`);
  }
  return url;
}

export function classifyLocalTarget(
  value: string,
  expectedDatabase: string,
  expectedRole: string,
  environment = "local"
): RedactedTarget {
  const url = parsedPostgresUrl(value, "local database URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || 5432);
  const database = decodeURIComponent(url.pathname.slice(1));
  const role = decodeURIComponent(url.username);
  if (
    environment !== "local" ||
    !targets.loopbackHosts.includes(host) ||
    port < 1 ||
    port > 65535 ||
    database !== expectedDatabase ||
    role !== expectedRole
  ) {
    throw new DatabaseToolError("TARGET_REJECTED", "The local database target is not allowlisted.");
  }
  if (["sslmode", "sslcert", "sslkey", "sslrootcert"].some((key) => url.searchParams.has(key))) {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "The local database URL must not set TLS options."
    );
  }
  return {
    targetClass: "local",
    redactedHost: host,
    port,
    database,
    roleClass: role,
    tlsMode: "local-plaintext",
  };
}

export function classifyStagingTarget(
  value: string,
  expectedRole: string,
  environment = "staging"
): RedactedTarget {
  const url = parsedPostgresUrl(value, "staging database URL");
  const database = decodeURIComponent(url.pathname.slice(1));
  const role = decodeURIComponent(url.username).split(".")[0];
  const directHost = `db.${targets.stagingProjectRef}.supabase.co`;
  const allowedParameters = new Set<string>();
  const hasUnknownParameter = [...url.searchParams.keys()].some(
    (key) => !allowedParameters.has(key)
  );
  if (
    environment !== "staging" ||
    url.hostname !== directHost ||
    Number(url.port || 5432) !== 5432 ||
    database !== targets.stagingDatabase ||
    role !== expectedRole ||
    hasUnknownParameter
  ) {
    throw new DatabaseToolError(
      "TARGET_REJECTED",
      "The staging database target is not allowlisted."
    );
  }
  return {
    targetClass: "staging",
    redactedHost: directHost,
    port: 5432,
    database,
    roleClass: role,
    tlsMode: "verify-full",
  };
}

export function migrationChecksum(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}
