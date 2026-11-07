// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArguments } from "./cli";
import { readSnapshot, serializeBackup, sourceConfig, verifyBackup } from "./backup";
import { insideState, privateDirectory } from "./files";
import { verifyRelease } from "./prepare";
import { sourceRoleSql, sourceWritesSql } from "./source-access";
import {
  assertClosure,
  canonicalJson,
  databaseFingerprint,
  emptyDataset,
  sha256,
  sourceEmail,
  tableNames,
  tables,
  type DataRow,
  type Dataset,
  type Table,
} from "./contracts";

function row(table: Table, overrides: DataRow): DataRow {
  return { ...Object.fromEntries(tables[table].map((column) => [column, null])), ...overrides };
}

function fixture(): Dataset {
  const data = emptyDataset();
  data.users = [row("users", { id: "source", email: sourceEmail, username: "old name" })];
  data.Blog = [row("Blog", { id: 1, authorId: "source", content: "private article" })];
  data.Tag = [row("Tag", { id: 2, userId: "source" })];
  data.Todo = [row("Todo", { id: 3, userId: "source" })];
  data.Checklist = [row("Checklist", { id: "checklist", userId: "source" })];
  data.ChecklistItem = [row("ChecklistItem", { id: "item", checklistId: "checklist" })];
  data.PomodoroRecord = [row("PomodoroRecord", { id: "pomodoro", userId: "source" })];
  data.TagsOnBlogs = [row("TagsOnBlogs", { blogId: 1, tagId: 2, assignedBy: "source" })];
  data.TagsOnTodos = [row("TagsOnTodos", { todoId: 3, tagId: 2, assignedBy: "source" })];
  data.BlogLike = [row("BlogLike", { id: "like", blogId: 1, userId: "source" })];
  data.BlogFavorite = [row("BlogFavorite", { id: "favorite", blogId: 1, userId: "source" })];
  data.DailyStat = [row("DailyStat", { id: 4 })];
  data.Exercise = [row("Exercise", { id: 5 })];
  data.WorkoutItem = [row("WorkoutItem", { id: 6, dailyStatId: 4, exerciseId: 5 })];
  data.WorkoutSet = [row("WorkoutSet", { id: 7, workoutItemId: 6 })];
  data.Prompt = [row("Prompt", { id: 8 })];
  return data;
}

const testDirectories: string[] = [];
const readonlyRole = {
  rolsuper: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  can_assume_writer: false,
};
function sourceMetadata(sql: string) {
  if (sql.includes("transaction_read_only")) return { rows: [{ read_only: "on" }] };
  if (sql === sourceRoleSql) return { rows: [readonlyRole] };
  if (sql === sourceWritesSql) return { rows: [] };
  return undefined;
}
afterEach(async () => {
  for (const directory of testDirectories.splice(0)) {
    const allowed = path.resolve(insideState("backups")) + path.sep;
    if (!path.resolve(directory).startsWith(allowed)) throw Error("Test cleanup target rejected");
    await rm(directory, { recursive: true, force: true });
  }
});

async function savedFixture(): Promise<{ id: string; directory: string; digest: string }> {
  const id = randomUUID();
  const directory = insideState("backups", id);
  await mkdir(directory, { recursive: true });
  testDirectories.push(directory);
  const { manifest, files } = serializeBackup(fixture(), id, "a".repeat(64));
  for (const table of tableNames)
    await writeFile(path.join(directory, `${table}.jsonl`), files[table]);
  const contents = `${canonicalJson(manifest)}\n`;
  await writeFile(path.join(directory, "manifest.json"), contents);
  return { id, directory, digest: sha256(contents) };
}

describe("0019 business backup boundary", () => {
  it("AC-7, AC-11 serializes all selected business and shared tables without credentials", () => {
    const { manifest, files } = serializeBackup(
      fixture(),
      "2778e9c2-6f9c-46dd-9395-68f867a8564b",
      "a".repeat(64)
    );
    expect(Object.keys(manifest.tables)).toEqual(tableNames);
    expect(manifest.sharedTables).toEqual([
      "DailyStat",
      "WorkoutItem",
      "WorkoutSet",
      "Exercise",
      "Prompt",
    ]);
    expect(manifest.tables.users.columns).not.toEqual(
      expect.arrayContaining(["password", "role", "authMode"])
    );
    expect(manifest.tables.Blog.sha256).toBe(sha256(files.Blog));
    expect(manifest.contentDigest).toBe(sha256(canonicalJson(manifest.tables)));
    expect(files.Blog).toContain("private article");
  });

  it.each([
    ["TagsOnBlogs", "blogId", 999],
    ["TagsOnBlogs", "tagId", 999],
    ["TagsOnTodos", "todoId", 999],
    ["TagsOnTodos", "tagId", 999],
    ["BlogLike", "blogId", 999],
    ["BlogFavorite", "blogId", 999],
    ["ChecklistItem", "checklistId", "missing"],
    ["WorkoutItem", "dailyStatId", 999],
    ["WorkoutItem", "exerciseId", 999],
    ["WorkoutSet", "workoutItemId", 999],
  ] as const)("AC-7 rejects an out of scope or missing reference %s.%s", (table, column, value) => {
    const data = fixture();
    data[table][0][column] = value;
    expect(() => assertClosure(data, "source")).toThrow("REFERENCE_OUT_OF_SCOPE");
  });

  it("AC-7 rejects unknown assignedBy rather than guessing a user mapping", () => {
    const data = fixture();
    data.TagsOnBlogs[0].assignedBy = "someone-else";
    expect(() => assertClosure(data, "source")).toThrow("ASSIGNED_BY_OUT_OF_SCOPE");
  });

  it("AC-7, AC-11 rejects leaked authentication columns and missing business columns", () => {
    const data = fixture();
    data.users[0].password = "not-a-real-password";
    expect(() => assertClosure(data, "source")).toThrow("COLUMN_ALLOWLIST_MISMATCH");
    delete data.users[0].password;
    delete data.Blog[0].content;
    expect(() => assertClosure(data, "source")).toThrow("COLUMN_ALLOWLIST_MISMATCH");
  });

  it("AC-7 rejects a different owner and duplicate root records", () => {
    const data = fixture();
    data.Todo[0].userId = "other";
    expect(() => assertClosure(data, "source")).toThrow("OWNER_OUT_OF_SCOPE");
    data.Todo[0].userId = "source";
    data.Todo.push({ ...data.Todo[0] });
    expect(() => assertClosure(data, "source")).toThrow("DUPLICATE_PRIMARY_KEY");
  });

  it("AC-7 uses stable file order and canonical date serialization", () => {
    const data = fixture();
    data.Blog.push(
      row("Blog", { id: 9, authorId: "source", createdAt: new Date("2026-11-04T00:00:00.000Z") })
    );
    const first = serializeBackup(data, "2778e9c2-6f9c-46dd-9395-68f867a8564b", "a".repeat(64));
    data.Blog.reverse();
    const second = serializeBackup(data, first.manifest.backupId, first.manifest.sourceFingerprint);
    expect(second).toEqual(first);
    expect(second.files.Blog).toContain("2026-11-04T00:00:00.000Z");
    expect(() => canonicalJson({ duration: Infinity })).toThrow("INVALID_SERIALIZED_VALUE");
  });

  it("AC-7 fingerprints only host, explicit port and database", () => {
    const a = databaseFingerprint("postgresql://reader:secret-a@db.example.test:5432/business");
    expect(a).toBe(databaseFingerprint("postgresql://other:secret-b@DB.example.test/business"));
    expect(a).not.toBe(databaseFingerprint("postgresql://reader:secret-a@db.example.test/other"));
    expect(() =>
      databaseFingerprint("postgresql://reader:secret@db.example.test/business?sslmode=disable")
    ).toThrow("INVALID_DATABASE_CONFIG");
  });

  it("AC-7 queries both sides of tag relations before checking the closure", async () => {
    const data = fixture();
    const sqlCalls: string[] = [];
    await readSnapshot(async (sql) => {
      sqlCalls.push(sql);
      const metadata = sourceMetadata(sql);
      if (metadata) return metadata;
      if (sql.includes("FROM pg_constraint")) return { rows: [] };
      const firstTable = sql.match(/FROM public\."([^"]+)"/)?.[1];
      const table = tableNames.find((name) => name === firstTable);
      if (!table) throw Error("Unexpected query");
      return { rows: data[table] };
    });
    for (const table of ["TagsOnBlogs", "TagsOnTodos"]) {
      expect(sqlCalls.find((sql) => sql.includes(`FROM public."${table}"`))).toMatch(
        / OR "tagId" IN/
      );
    }
  });

  it("AC-7 refuses a write capable source role before selecting business records", async () => {
    const calls: string[] = [];
    await expect(
      readSnapshot(async (sql) => {
        calls.push(sql);
        if (sql === sourceWritesSql)
          return { rows: [{ schema_name: "public", relation_name: "Blog", can_update: true }] };
        const metadata = sourceMetadata(sql);
        if (metadata) return metadata;
        throw Error("Business records must not be read");
      })
    ).rejects.toThrow("SOURCE_ROLE_NOT_READ_ONLY");
    expect(calls).toHaveLength(3);
  });

  it("AC-7 refuses a previously unreviewed foreign key touching selected records", async () => {
    await expect(
      readSnapshot(
        async (sql) =>
          sourceMetadata(sql) ?? {
            rows: [
              {
                source_schema: "public",
                source_table: "NewBusinessTable",
                source_column: "blogId",
                target_schema: "public",
                target_table: "Blog",
                target_column: "id",
                width: 1,
              },
            ],
          }
      )
    ).rejects.toThrow("UNREVIEWED_SOURCE_RELATION");
  });

  it("AC-11 rejects unknown, duplicate, missing CLI inputs and commands", () => {
    expect(() =>
      parseArguments([
        "backup",
        "--env-file",
        "source.env",
        "--source-fingerprint",
        "a",
        "--role",
        "ROOT",
      ])
    ).toThrow("INVALID_ARGUMENTS");
    expect(() => parseArguments(["prepare", "--release-dir", "a", "--release-dir", "b"])).toThrow(
      "INVALID_ARGUMENTS"
    );
    expect(() => parseArguments(["backup", "--env-file", "source.env"])).toThrow(
      "REQUIRED_ARGUMENT_MISSING"
    );
    expect(() => parseArguments(["restore"])).toThrow("INVALID_COMMAND");
    expect(() => parseArguments(["__proto__"])).toThrow("INVALID_COMMAND");
  });

  it("AC-7 verifies a saved backup offline, rejects modified files and a mismatched manifest digest", async () => {
    const saved = await savedFixture();
    const manifest = await verifyBackup(saved.id, saved.digest);
    expect(manifest.referenceCheck).toBe("passed");
    await expect(verifyBackup(saved.id, "b".repeat(64))).rejects.toThrow(
      "MANIFEST_DIGEST_MISMATCH"
    );
    await writeFile(path.join(saved.directory, "Blog.jsonl"), "");
    await expect(verifyBackup(saved.id, saved.digest)).rejects.toThrow();
  });

  it("AC-7 rejects extra manifest fields even when the caller recomputes the outer digest", async () => {
    const saved = await savedFixture();
    const { manifest } = serializeBackup(fixture(), saved.id, "a".repeat(64));
    const contents = canonicalJson({ ...manifest, password: "not-a-real-secret" });
    await writeFile(path.join(saved.directory, "manifest.json"), contents);
    await expect(verifyBackup(saved.id, sha256(contents))).rejects.toThrow(
      "BACKUP_CONTENT_MISMATCH"
    );
  });

  it("AC-7 refuses partial output with only a pending manifest", async () => {
    const id = randomUUID();
    const directory = insideState("backups", id);
    await mkdir(directory, { recursive: true });
    testDirectories.push(directory);
    await writeFile(path.join(directory, "manifest.pending.json"), "{}");
    await expect(verifyBackup(id, sha256("{}"))).rejects.toThrow();
  });

  it("AC-11 reads only the explicit private source file and refuses unrelated environment keys", async () => {
    const saved = await savedFixture();
    await privateDirectory(saved.directory);
    const file = path.join(saved.directory, "source.env");
    const source =
      'POSTGRES_BACKUP_URL="postgresql://fixture:synthetic@db.example.test/business"\nPOSTGRES_SSL_CA="-----BEGIN CERTIFICATE-----\\nsynthetic\\n-----END CERTIFICATE-----"\n';
    await writeFile(file, source, { mode: 0o600 });
    const result = await sourceConfig(file);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ca).toContain("\nsynthetic\n");
    await writeFile(file, `${source}POSTGRES_DATABASE_URL=ignored\n`, { mode: 0o600 });
    await expect(sourceConfig(file)).rejects.toThrow("SOURCE_CONFIG_KEYS_REJECTED");
  });

  it("AC-1 rejects an altered SDK archive before consuming its public entrypoint", async () => {
    const saved = await savedFixture();
    await writeFile(
      path.join(saved.directory, "user-center-next-better-auth-0.1.6.tgz"),
      "altered"
    );
    await expect(verifyRelease(saved.directory)).rejects.toThrow("RELEASE_DIGEST_MISMATCH");
  });

  it("AC-11 refuses a secret file outside the designated ignored directory", async () => {
    await expect(sourceConfig(path.resolve("package.json"))).rejects.toThrow(
      "SOURCE_CONFIG_LOCATION_REJECTED"
    );
  });
});
