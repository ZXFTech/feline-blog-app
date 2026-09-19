import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const modes = {
  "migrate-dev": ["migrate", "dev"],
  "migrate-deploy": ["migrate", "deploy"],
  "migrate-status": ["migrate", "status"],
};

function requireValue(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function postgresUrlWithVerifiedTls(value, certificatePath, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must use the postgresql:// or postgres:// protocol.`);
  }
  if (url.port === "6543" || url.searchParams.get("pgbouncer") === "true") {
    throw new Error(`${name} must not use a transaction pooler for Prisma migrations.`);
  }
  const sslParameters = ["sslmode", "sslcert", "sslkey", "sslrootcert"];
  if (sslParameters.some((parameter) => url.searchParams.has(parameter))) {
    throw new Error(`${name} must not contain SSL parameters; the Prisma wrapper supplies them.`);
  }
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", certificatePath);
  return url.toString();
}

export function databaseTarget(value) {
  const url = new URL(value);
  const tenant = url.hostname.includes("pooler.supabase.com")
    ? decodeURIComponent(url.username).split(".").slice(1).join(".")
    : url.hostname;
  return `${tenant}:${url.port || "5432"}${url.pathname}`;
}

async function run() {
  const mode = process.argv[2];
  const prismaArguments = modes[mode];
  if (!prismaArguments) {
    throw new Error("Expected one of: migrate-dev, migrate-deploy, migrate-status.");
  }

  const migrationUrl = requireValue(process.env, "POSTGRES_MIGRATION_URL");
  const shadowUrl = mode === "migrate-dev"
    ? requireValue(process.env, "POSTGRES_SHADOW_DATABASE_URL")
    : undefined;
  if (shadowUrl && databaseTarget(migrationUrl) === databaseTarget(shadowUrl)) {
    throw new Error("POSTGRES_SHADOW_DATABASE_URL must be a separate database target.");
  }

  const certificate = requireValue(process.env, "POSTGRES_SSL_CA").replace(/\\n/g, "\n");
  const forwardedArguments = process.argv.slice(3);
  if (forwardedArguments[0] === "--") forwardedArguments.shift();
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "feline-prisma-ca-"));
  const certificatePath = path.join(temporaryDirectory, "root.crt");

  try {
    await writeFile(certificatePath, certificate, { encoding: "utf8", mode: 0o600 });
    const childEnvironment = {
      ...process.env,
      POSTGRES_MIGRATION_URL: postgresUrlWithVerifiedTls(
        migrationUrl,
        certificatePath,
        "POSTGRES_MIGRATION_URL"
      ),
      ...(shadowUrl
        ? {
            POSTGRES_SHADOW_DATABASE_URL: postgresUrlWithVerifiedTls(
              shadowUrl,
              certificatePath,
              "POSTGRES_SHADOW_DATABASE_URL"
            ),
          }
        : {}),
    };
    const pnpmEntrypoint = process.env.npm_execpath;
    if (!pnpmEntrypoint) throw new Error("Run this command through pnpm.");

    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          pnpmEntrypoint,
          "exec",
          "prisma",
          ...prismaArguments,
          "--config",
          "./prisma.postgres.config.ts",
          ...forwardedArguments,
        ],
        { env: childEnvironment, stdio: "inherit" }
      );
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
