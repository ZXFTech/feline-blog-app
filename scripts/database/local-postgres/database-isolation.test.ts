import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanChildEnvironment,
  mergeLocalDevelopmentEnvironment,
  readEnvironmentFile,
  rejectInheritedProtectedEnvironment,
  requireValue,
} from "./env";
import { safeFailure, DatabaseToolError } from "./errors";
import { parseMigrationName } from "./migrate";
import {
  classifyLocalTarget,
  classifyStagingMigrationTarget,
  classifyStagingTarget,
  migrationChecksum,
} from "./target";
import { isProtectedKey, repositoryRoot, targets } from "./config";
import { normalizeForwardedArguments, parseRecoveryOperationId } from "./arguments";
import { hostLockInspectionSummary } from "./lock";

const originalDatabaseUrl = process.env.POSTGRES_DATABASE_URL;
const temporaryEnvironment = path.join(".feline-blog", "database-isolation-test.env");

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.POSTGRES_DATABASE_URL;
  else process.env.POSTGRES_DATABASE_URL = originalDatabaseUrl;
  return rm(path.join(repositoryRoot, temporaryEnvironment), { force: true });
});

describe("database environment isolation", () => {
  it("accepts only the exact local runtime target", () => {
    const target = classifyLocalTarget(
      "postgresql://app_runtime:secret@127.0.0.1:54329/feline_blog_dev",
      targets.developmentDatabase,
      targets.runtimeRole
    );
    expect(target).toMatchObject({
      targetClass: "local",
      redactedHost: "127.0.0.1",
      database: "feline_blog_dev",
      roleClass: "app_runtime",
    });
    expect(target).not.toHaveProperty("password");
  });

  it.each([
    "postgresql://app_runtime:secret@example.com:54329/feline_blog_dev",
    "postgresql://app_runtime:secret@127.0.0.1:54329/postgres",
    "postgresql://local_admin:secret@127.0.0.1:54329/feline_blog_dev",
    "postgresql://app_runtime:secret@127.0.0.1:54329/feline_blog_dev?sslmode=disable",
  ])("rejects a non allowlisted local target", (url) => {
    expect(() =>
      classifyLocalTarget(url, targets.developmentDatabase, targets.runtimeRole)
    ).toThrow(DatabaseToolError);
  });

  it("keeps direct staging targets available to non-migration tooling", () => {
    const value = `postgresql://app_migrator:secret@db.${targets.stagingProjectRef}.supabase.co:5432/postgres`;
    expect(classifyStagingTarget(value, "app_migrator")).toMatchObject({
      targetClass: "staging",
      database: "postgres",
      roleClass: "app_migrator",
      tlsMode: "verify-full",
    });
  });

  it("covers: AC-15 accepts only the exact qualified Session Pooler migration target", () => {
    const value = `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@${targets.stagingSessionPoolerHost}:${targets.stagingSessionPoolerPort}/${targets.stagingDatabase}`;
    expect(classifyStagingMigrationTarget(value)).toMatchObject({
      targetClass: "staging",
      redactedHost: targets.stagingSessionPoolerHost,
      port: targets.stagingSessionPoolerPort,
      database: targets.stagingDatabase,
      roleClass: targets.migratorRole,
      tlsMode: "verify-full",
    });
  });

  it.each(["mysql://app_runtime:secret@127.0.0.1:54329/feline_blog_dev", "not-a-url"])(
    "covers: AC-12 rejects a malformed local PostgreSQL target",
    (url) => {
      expect(() =>
        classifyLocalTarget(url, targets.developmentDatabase, targets.runtimeRole)
      ).toThrow(DatabaseToolError);
    }
  );

  it.each([
    `postgresql://app_migrator:secret@db.${targets.stagingProjectRef}.supabase.co:6543/postgres`,
    `postgresql://app_migrator:secret@db.${targets.stagingProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    `postgresql://app_runtime:secret@db.${targets.stagingProjectRef}.supabase.co:5432/postgres`,
  ])("covers: AC-7 rejects a staging endpoint outside the exact allowlist", (url) => {
    expect(() => classifyStagingTarget(url, targets.migratorRole)).toThrow(DatabaseToolError);
  });

  it.each([
    `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@db.${targets.stagingProjectRef}.supabase.co:5432/postgres`,
    `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@${targets.stagingSessionPoolerHost}:6543/postgres`,
    `postgresql://${targets.migratorRole}:secret@${targets.stagingSessionPoolerHost}:5432/postgres`,
    `postgresql://${targets.migratorRole}.wrong-project:secret@${targets.stagingSessionPoolerHost}:5432/postgres`,
    `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@another.pooler.supabase.com:5432/postgres`,
    `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@${targets.stagingSessionPoolerHost}:5432/postgres?sslmode=verify-full`,
    `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@${targets.stagingSessionPoolerHost}:5432/postgres?application_name=test`,
  ])("covers: AC-15 rejects a staging migration target outside the exact allowlist", (url) => {
    expect(() => classifyStagingMigrationTarget(url)).toThrow(DatabaseToolError);
  });

  it("recognizes protected prefixes and removes inherited values", () => {
    expect(isProtectedKey("POSTGRES_FUTURE_SECRET")).toBe(true);
    expect(isProtectedKey("PGFUTURE")).toBe(true);
    expect(isProtectedKey("PATH")).toBe(false);
    const child = cleanChildEnvironment([{ POSTGRES_DATABASE_URL: "local-value" }]);
    expect(child.POSTGRES_DATABASE_URL).toBe("local-value");
  });

  it("rejects protected inherited values", () => {
    process.env.POSTGRES_DATABASE_URL = "secret-value";
    expect(() => rejectInheritedProtectedEnvironment(process.env)).toThrow(/POSTGRES_DATABASE_URL/);
  });

  it("covers: AC-2 builds a child environment without inherited database secrets", () => {
    process.env.POSTGRES_DATABASE_URL = "inherited-secret";

    const child = cleanChildEnvironment(
      [{ POSTGRES_DATABASE_URL: "explicit-local", POSTGRES_ENVIRONMENT: "local" }],
      { POSTGRES_MIGRATION_URL: "explicit-migration" }
    );

    expect(child.POSTGRES_DATABASE_URL).toBe("explicit-local");
    expect(child.POSTGRES_MIGRATION_URL).toBe("explicit-migration");
    expect(child.POSTGRES_ENVIRONMENT).toBe("local");
  });

  it("rewrites only database owned entries in the local development environment", () => {
    const current = [
      "# Application configuration",
      "JWT_SECRET=jwt-secret",
      "CHECKLIST_CURSOR_SECRET=cursor-secret",
      "CRON_SECRET=cron-secret",
      "FUTURE_APP_SETTING=future-value",
      "DATABASE_URL=mysql://legacy-user:legacy-password@127.0.0.1/legacy",
      "POSTGRES_ENVIRONMENT=staging",
      "POSTGRES_DATABASE_URL=postgresql://stale-runtime",
      "POSTGRES_ADMIN_URL=postgresql://stale-admin",
      "PGHOST=stale-host",
      "",
    ].join("\n");

    const merged = mergeLocalDevelopmentEnvironment(current, {
      POSTGRES_ENVIRONMENT: "local",
      POSTGRES_DATABASE_URL: "postgresql://local-runtime",
      POSTGRES_MIGRATION_URL: "postgresql://local-migrator",
    });
    const parsed = Object.fromEntries(
      merged
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        })
    );

    expect(merged).toContain("# Application configuration");
    expect(parsed).toMatchObject({
      JWT_SECRET: "jwt-secret",
      CHECKLIST_CURSOR_SECRET: "cursor-secret",
      CRON_SECRET: "cron-secret",
      FUTURE_APP_SETTING: "future-value",
      DATABASE_URL: "mysql://legacy-user:legacy-password@127.0.0.1/legacy",
      POSTGRES_ENVIRONMENT: "local",
      POSTGRES_DATABASE_URL: "postgresql://local-runtime",
      POSTGRES_MIGRATION_URL: "postgresql://local-migrator",
    });
    expect(parsed).not.toHaveProperty("POSTGRES_ADMIN_URL");
    expect(parsed).not.toHaveProperty("PGHOST");
  });

  it("covers: AC-10 rejects a persisted process only write gate", async () => {
    const filePath = path.join(repositoryRoot, temporaryEnvironment);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "STAGING_MIGRATION_ALLOW_WRITE=true\n", "utf8");

    await expect(readEnvironmentFile(temporaryEnvironment)).rejects.toMatchObject({
      code: "CONFIG_CONFLICT",
    });
  });

  it("covers: AC-10 reports missing required values without exposing other entries", () => {
    expect(() => requireValue({ SECRET_MARKER: "do-not-print" }, "POSTGRES_SSL_CA")).toThrow(
      "POSTGRES_SSL_CA is required"
    );
    try {
      requireValue({ SECRET_MARKER: "do-not-print" }, "POSTGRES_SSL_CA");
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print");
    }
  });

  it("covers: AC-3 computes stable migration checksums", () => {
    const checksum = migrationChecksum("SELECT 1;");
    expect(checksum).toBe(migrationChecksum(Buffer.from("SELECT 1;")));
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrationChecksum("SELECT 2;")).not.toBe(migrationChecksum("SELECT 1;"));
  });

  it.each(["add-user", "a", "a1-b2", "x".repeat(64)])(
    "accepts a canonical migration name",
    (name) => expect(parseMigrationName(["--name", name])).toBe(name)
  );

  it.each([
    { args: [] },
    { args: ["--name", "Bad_Name"] },
    { args: ["--name", "double--dash"] },
    { args: ["--name", "trailing-"] },
    { args: ["--create-only"] },
    { args: ["--name", "good", "--url", "secret"] },
  ])("rejects unsafe Prisma arguments", ({ args }) => {
    expect(() => parseMigrationName(args)).toThrow(DatabaseToolError);
  });

  it("maps unknown failures to a safe summary", () => {
    const failure = safeFailure(new Error("postgresql://user:secret@example.com/private"));
    expect(JSON.stringify(failure)).not.toContain("secret");
    expect(failure.code).toBe("CONFIG_CONFLICT");
  });

  it("normalizes the pnpm argument separator before command validation", () => {
    expect(normalizeForwardedArguments(["--", "--confirm", "resource"])).toEqual([
      "--confirm",
      "resource",
    ]);
    expect(normalizeForwardedArguments(["--rotate"])).toEqual(["--rotate"]);
  });

  it("accepts only canonical refresh operation ids", () => {
    expect(parseRecoveryOperationId([])).toBeUndefined();
    expect(parseRecoveryOperationId(["--operation", "a".repeat(32)])).toBe("a".repeat(32));
    expect(() =>
      parseRecoveryOperationId(["--operation", "00000000-0000-0000-0000-000000000000"])
    ).toThrow(DatabaseToolError);
    expect(() => parseRecoveryOperationId(["--operation", "A".repeat(32)])).toThrow(
      DatabaseToolError
    );
    expect(() => parseRecoveryOperationId(["--unknown", "a".repeat(32)])).toThrow(
      DatabaseToolError
    );
  });

  it("gives exact inspection commands when a host lock cannot be claimed", () => {
    const summary = hostLockInspectionSummary("C:\\state\\feline-blog-local.lock", {
      pid: 1234,
    });
    expect(summary).toContain("C:\\state\\feline-blog-local.lock");
    expect(summary).toContain("1234");
    expect(summary).toContain(process.platform === "win32" ? "Get-Content" : "cat");
    expect(summary).toContain(process.platform === "win32" ? "Get-Process" : "ps -p");
    expect(summary).toContain("process creation identity");
    expect(summary).toContain("database ledger");
  });
});
