import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertImmutableMigrationChanges } from "./migration-check";
import { assertSafeMigrationSql } from "./staging-core";

const reviewed = ["20261015000000_user_center", "20261016000000_auth_ops"].map((name) => ({
  name,
  path: "prisma/postgres/migrations/" + name + "/migration.sql",
}));

function migrationSql(file: string): string {
  return readFileSync(new URL("../../" + file, import.meta.url), "utf8");
}

describe.each(reviewed)("reviewed migration $name", ({ name, path }) => {
  it("accepts the unchanged reviewed SQL at its exact path", () => {
    expect(() => assertSafeMigrationSql(migrationSql(path), name, path)).not.toThrow();
  });

  it("accepts Windows checkout line endings without changing the reviewed content", () => {
    const sql = migrationSql(path).replace(/\r?\n/g, "\r\n");
    expect(() => assertSafeMigrationSql(sql, name, path)).not.toThrow();
  });

  it.each([
    ["function body", "RAISE EXCEPTION", "RAISE NOTICE"],
    ["security context", "SECURITY DEFINER", "SECURITY INVOKER"],
    ["search path", "search_path=pg_catalog", "search_path=public"],
    ["public ACL", "FROM PUBLIC", "FROM CURRENT_USER"],
  ])("rejects a modified %s", (_label, original, replacement) => {
    const sql = migrationSql(path).replace(original, replacement);
    expect(() => assertSafeMigrationSql(sql, name, path)).toThrow(/reviewed.*checksum/i);
  });

  it.each([
    "DROP TABLE public.users;",
    "TRUNCATE TABLE public.users;",
    "UPDATE public.users SET password = NULL;",
    "DELETE FROM public.users;",
    "DO $$ BEGIN RAISE NOTICE 'unreviewed'; END $$;",
  ])("rejects appended unreviewed SQL: %s", (appended) => {
    expect(() => assertSafeMigrationSql(migrationSql(path) + "\n" + appended, name, path)).toThrow(
      /reviewed.*checksum/i
    );
  });

  it("rejects even an additive replacement for a reviewed file", () => {
    expect(() =>
      assertSafeMigrationSql("CREATE TABLE replacement(id integer);", name, path)
    ).toThrow(/reviewed.*checksum/i);
  });

  it.each([
    (file: string) => "copied/" + file,
    (file: string) => "./" + file,
    (file: string) => file.replace("/migrations/", "/migrations/copied/"),
    (file: string) => file.replace("/migrations/", "/migrations/../migrations/"),
    (file: string) => file.replaceAll("/", "\\"),
  ])("rejects copied or aliased paths %#", (alias) => {
    expect(() => assertSafeMigrationSql(migrationSql(path), name, alias(path))).toThrow(
      /unclassified|rejected/i
    );
  });

  it("keeps comments inside the reviewed content boundary", () => {
    expect(() => assertSafeMigrationSql(migrationSql(path) + "\n-- changed", name, path)).toThrow(
      /reviewed.*checksum/i
    );
  });

  it("rejects a different migration identity at the reviewed path", () => {
    expect(() => assertSafeMigrationSql(migrationSql(path), "unreviewed", path)).toThrow();
  });

  it("does not approve a migration by its name alone", () => {
    expect(() => assertSafeMigrationSql(migrationSql(path), name)).toThrow(/unclassified/i);
  });

  it.each(["M", "D", "R100"])("keeps reviewed history immutable for status %s", (status) => {
    const paths = status.startsWith("R") ? [path, "renamed/" + path] : [path];
    expect(() => assertImmutableMigrationChanges([{ status, paths }])).toThrow(/immutable/);
  });
});

describe("unreviewed migration SQL", () => {
  it("still accepts the additive managed history migration without a reviewed record", () => {
    const name = "20261018000000_managed_cron_history";
    const path = "prisma/postgres/migrations/" + name + "/migration.sql";
    expect(() => assertSafeMigrationSql(migrationSql(path), name, path)).not.toThrow();
  });

  it.each([
    "DO $$ BEGIN RAISE NOTICE 'unknown'; END $$;",
    "CREATE FUNCTION unknown() RETURNS integer LANGUAGE sql AS $body$ SELECT 1 $body$;",
    "DROP TABLE users;",
    "TRUNCATE TABLE users;",
    "DELETE FROM users;",
    "UPDATE users SET password = NULL;",
    "ALTER TABLE users ALTER COLUMN password TYPE text;",
    "ALTER TABLE users ALTER COLUMN password SET NOT NULL;",
    "EXECUTE untrusted_sql;",
  ])("keeps rejecting unreviewed statements: %s", (sql) => {
    expect(() =>
      assertSafeMigrationSql(
        sql,
        "unreviewed",
        "prisma/postgres/migrations/unreviewed/migration.sql"
      )
    ).toThrow(/unclassified|rejected/i);
  });
});
