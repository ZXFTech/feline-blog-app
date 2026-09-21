import { describe, expect, it } from "vitest";
import { databaseTarget, postgresUrlWithVerifiedTls } from "./run-postgres-prisma.mjs";

describe("PostgreSQL Prisma TLS wrapper", () => {
  it("injects full certificate verification into a migration URL", () => {
    const result = new URL(
      postgresUrlWithVerifiedTls(
        "postgresql://app_migrator:secret@pooler.example:5432/postgres",
        "C:/temp/root.crt",
        "POSTGRES_MIGRATION_URL"
      )
    );

    expect(result.searchParams.get("sslmode")).toBe("verify-full");
    expect(result.searchParams.get("sslrootcert")).toBe("C:/temp/root.crt");
    expect(result.searchParams.has("options")).toBe(false);
  });

  it.each([
    "postgresql://role:secret@example.invalid:6543/postgres",
    "postgresql://role:secret@example.invalid:5432/postgres?pgbouncer=true",
  ])("rejects a transaction pooler: %s", (value) => {
    expect(() =>
      postgresUrlWithVerifiedTls(value, "/tmp/root.crt", "POSTGRES_MIGRATION_URL")
    ).toThrow("must not use a transaction pooler");
  });

  it.each(["sslmode=require", "application_name=unsafe", "options=-c%20statement_timeout=0"])(
    "rejects raw URL query settings that could override the wrapper: %s",
    (query) => {
      expect(() =>
        postgresUrlWithVerifiedTls(
          `postgresql://role:secret@example.invalid:5432/postgres?${query}`,
          "/tmp/root.crt",
          "POSTGRES_MIGRATION_URL"
        )
      ).toThrow("must not contain query parameters");
    }
  );

  it("distinguishes Supavisor projects even when the pooler host is shared", () => {
    expect(
      databaseTarget("postgresql://role.project-a@aws-0-region.pooler.supabase.com:5432/postgres")
    ).not.toBe(
      databaseTarget("postgresql://role.project-b@aws-0-region.pooler.supabase.com:5432/postgres")
    );
  });
});
