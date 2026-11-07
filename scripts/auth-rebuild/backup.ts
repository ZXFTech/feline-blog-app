import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";
import {
  assertClosure,
  canonicalJson,
  databaseFingerprint,
  emptyDataset,
  mapTables,
  RebuildError,
  sha256,
  sharedTables,
  sourceEmail,
  tableContents,
  tableNames,
  tables,
  type DataRow,
  type Dataset,
  type Table,
} from "./contracts";
import { insideState, privateConfigFile, privateDirectory, regularFile } from "./files";
import { assertSourceAccess, type SourceAccess } from "./source-access";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const quoted = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const qualified = (table: Table): string => `public.${quoted(table)}`;

export async function sourceConfig(
  file: string
): Promise<{ connectionString: string; ca: string; fingerprint: string }> {
  // No implicit dotenv load, inherited connection or fallback to an application role.
  const values = dotenv.parse(await privateConfigFile(file));
  if (Object.keys(values).some((key) => !["POSTGRES_BACKUP_URL", "POSTGRES_SSL_CA"].includes(key)))
    throw new RebuildError("SOURCE_CONFIG_KEYS_REJECTED");
  const connectionString = values.POSTGRES_BACKUP_URL;
  const ca = values.POSTGRES_SSL_CA?.replace(/\\n/g, "\n");
  if (!connectionString || !ca?.includes("-----BEGIN CERTIFICATE-----"))
    throw new RebuildError("SOURCE_CONFIG_REQUIRED");
  return { connectionString, ca, fingerprint: databaseFingerprint(connectionString) };
}

type Query = (sql: string, values?: unknown[]) => Promise<{ rows: DataRow[] }>;

const expectedRelations = new Set([
  "Blog.authorId>users.id",
  "Tag.userId>users.id",
  "Todo.userId>users.id",
  "Checklist.userId>users.id",
  "PomodoroRecord.userId>users.id",
  "BlogLike.userId>users.id",
  "BlogFavorite.userId>users.id",
  "BlogLike.blogId>Blog.id",
  "BlogFavorite.blogId>Blog.id",
  "ChecklistItem.checklistId>Checklist.id",
  "TagsOnBlogs.blogId>Blog.id",
  "TagsOnBlogs.tagId>Tag.id",
  "TagsOnTodos.todoId>Todo.id",
  "TagsOnTodos.tagId>Tag.id",
  "WorkoutItem.dailyStatId>DailyStat.id",
  "WorkoutSet.workoutItemId>WorkoutItem.id",
]);
const excludedAuthTables = new Set([
  "sessions",
  "feline_auth_identity",
  "feline_auth_session",
  "feline_auth_flow",
  "auth_accounts",
]);

export async function readSnapshot(
  query: Query,
  onAccess?: (access: SourceAccess) => void
): Promise<Dataset> {
  const access = await assertSourceAccess(query);
  onAccess?.(access);
  // Unknown business relations cannot silently disappear from a complete backup.
  const relations = await query(
    `SELECT ns.nspname AS source_schema, s.relname AS source_table,
    a.attname AS source_column, nt.nspname AS target_schema, t.relname AS target_table,
    b.attname AS target_column, cardinality(c.conkey) AS width
    FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=s.relnamespace
    JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace nt ON nt.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=s.oid AND a.attnum=c.conkey[1]
    JOIN pg_attribute b ON b.attrelid=t.oid AND b.attnum=c.confkey[1]
    WHERE c.contype='f' AND ((ns.nspname='public' AND s.relname=ANY($1::text[]))
      OR (nt.nspname='public' AND t.relname=ANY($1::text[])))`,
    [tableNames]
  );
  for (const row of relations.rows) {
    const omittedAuth =
      row.source_schema === "public" &&
      row.target_schema === "public" &&
      excludedAuthTables.has(String(row.source_table)) &&
      row.target_table === "users" &&
      row.target_column === "id" &&
      row.width === 1;
    if (omittedAuth) continue;
    const relation = `${row.source_table}.${row.source_column}>${row.target_table}.${row.target_column}`;
    if (
      row.source_schema !== "public" ||
      row.target_schema !== "public" ||
      row.width !== 1 ||
      !expectedRelations.has(relation)
    )
      throw new RebuildError("UNREVIEWED_SOURCE_RELATION");
  }
  const data = emptyDataset();
  const select = async (table: Table, where = "", values: unknown[] = []): Promise<DataRow[]> => {
    const columns = tables[table].map(quoted).join(",");
    const result = await query(`SELECT ${columns} FROM ${qualified(table)} ${where}`, values);
    return result.rows;
  };
  data.users = await select("users", 'WHERE "email"::text=$1', [sourceEmail]);
  if (data.users.length !== 1 || typeof data.users[0].id !== "string")
    throw new RebuildError("SOURCE_USER_NOT_UNIQUE");
  const userId = data.users[0].id;
  for (const table of [
    "Blog",
    "Tag",
    "Todo",
    "Checklist",
    "PomodoroRecord",
    "BlogLike",
    "BlogFavorite",
  ] as const) {
    data[table] = await select(
      table,
      `WHERE ${quoted(table === "Blog" ? "authorId" : "userId")}=$1`,
      [userId]
    );
  }
  data.ChecklistItem = await select(
    "ChecklistItem",
    'WHERE "checklistId" IN (SELECT "id" FROM public."Checklist" WHERE "userId"=$1)',
    [userId]
  );
  // Scan BOTH sides before closure checking. An inner join here would lose broken edges.
  data.TagsOnBlogs = await select(
    "TagsOnBlogs",
    'WHERE "blogId" IN (SELECT "id" FROM public."Blog" WHERE "authorId"=$1) OR "tagId" IN (SELECT "id" FROM public."Tag" WHERE "userId"=$1)',
    [userId]
  );
  data.TagsOnTodos = await select(
    "TagsOnTodos",
    'WHERE "todoId" IN (SELECT "id" FROM public."Todo" WHERE "userId"=$1) OR "tagId" IN (SELECT "id" FROM public."Tag" WHERE "userId"=$1)',
    [userId]
  );
  for (const table of sharedTables) data[table] = await select(table);
  assertClosure(data, userId);
  return data;
}

export interface BackupManifest {
  schemaVersion: 1;
  backupId: string;
  status: "complete";
  sourceFingerprint: string;
  sourceUserId: string;
  sharedTables: typeof sharedTables;
  referenceCheck: "passed";
  tables: Record<
    Table,
    { file: string; columns: readonly string[]; rowCount: number; sha256: string }
  >;
  contentDigest: string;
}

export function serializeBackup(
  data: Dataset,
  backupId: string,
  fingerprint: string
): { manifest: BackupManifest; files: Record<Table, string> } {
  if (!uuid.test(backupId) || !digestPattern.test(fingerprint))
    throw new RebuildError("INVALID_BACKUP_IDENTITY");
  const userId = data.users[0]?.id;
  if (typeof userId !== "string") throw new RebuildError("SOURCE_USER_MISMATCH");
  assertClosure(data, userId);
  const files = Object.fromEntries(
    tableNames.map((table) => [table, tableContents(table, data[table])])
  ) as Record<Table, string>;
  const entries = mapTables((table) => ({
    file: `${table}.jsonl`,
    columns: tables[table],
    rowCount: data[table].length,
    sha256: sha256(files[table]),
  }));
  const manifest: BackupManifest = {
    schemaVersion: 1,
    backupId,
    status: "complete",
    sourceFingerprint: fingerprint,
    sourceUserId: userId,
    sharedTables,
    referenceCheck: "passed",
    tables: entries,
    contentDigest: sha256(canonicalJson(entries)),
  };
  return { manifest, files };
}

export async function backup(
  envFile: string,
  expectedFingerprint: string
): Promise<{
  backupId: string;
  manifestSha256: string;
  rowCounts: Record<string, number>;
  sourceAccess: SourceAccess;
}> {
  const config = await sourceConfig(envFile);
  if (!digestPattern.test(expectedFingerprint) || config.fingerprint !== expectedFingerprint)
    throw new RebuildError("SOURCE_FINGERPRINT_MISMATCH");
  const client = new Client({
    connectionString: config.connectionString,
    ssl: { ca: config.ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
    query_timeout: 60000,
    application_name: "feline_business_backup",
  });
  client.on("error", () => {});
  let inTransaction = false;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout='60s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    // Refuse RLS filtered exports rather than certify an incomplete dataset.
    await client.query("SET LOCAL row_security=off");
    let sourceAccess: SourceAccess | undefined;
    const data = await readSnapshot(
      (sql, values) => client.query(sql, values),
      (access) => {
        sourceAccess = access;
      }
    );
    if (!sourceAccess) throw new RebuildError("SOURCE_ROLE_NOT_READ_ONLY");
    const backupId = randomUUID();
    const serialized = serializeBackup(data, backupId, config.fingerprint);
    const directory = insideState("backups", backupId);
    await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
    await mkdir(directory, { mode: 0o700 });
    await privateDirectory(directory);
    for (const table of tableNames)
      await writeFile(path.join(directory, `${table}.jsonl`), serialized.files[table], {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
    const manifestContents = `${canonicalJson(serialized.manifest)}\n`;
    await writeFile(path.join(directory, "manifest.pending.json"), manifestContents, {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
    await client.query("COMMIT");
    inTransaction = false;
    // Only this atomic rename publishes completion. A failed export has no manifest.json.
    await rename(
      path.join(directory, "manifest.pending.json"),
      path.join(directory, "manifest.json")
    );
    return {
      backupId,
      manifestSha256: sha256(manifestContents),
      rowCounts: Object.fromEntries(tableNames.map((table) => [table, data[table].length])),
      sourceAccess,
    };
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    if (error instanceof RebuildError) throw error;
    throw new RebuildError("BACKUP_FAILED");
  } finally {
    await client.end().catch(() => {});
  }
}

export async function verifyBackup(
  backupId: string,
  expectedManifestSha256: string
): Promise<BackupManifest> {
  if (!uuid.test(backupId) || !digestPattern.test(expectedManifestSha256))
    throw new RebuildError("INVALID_BACKUP_IDENTITY");
  const directory = insideState("backups", backupId);
  const raw = await regularFile(path.join(directory, "manifest.json"));
  if (sha256(raw) !== expectedManifestSha256) throw new RebuildError("MANIFEST_DIGEST_MISMATCH");
  const input: unknown = JSON.parse(raw.toString("utf8"));
  if (
    !input ||
    typeof input !== "object" ||
    !("sourceFingerprint" in input) ||
    typeof input.sourceFingerprint !== "string"
  )
    throw new RebuildError("INVALID_BACKUP_MANIFEST");
  const data = emptyDataset();
  for (const table of tableNames) {
    const contents = (await regularFile(path.join(directory, `${table}.jsonl`))).toString("utf8");
    data[table] =
      contents === ""
        ? []
        : contents
            .trimEnd()
            .split("\n")
            .map((line): DataRow => {
              const row: unknown = JSON.parse(line);
              if (!row || typeof row !== "object" || Array.isArray(row))
                throw new RebuildError("INVALID_BACKUP_ROW");
              return row as DataRow;
            });
  }
  const expected = serializeBackup(data, backupId, input.sourceFingerprint);
  // Exact comparison also rejects unknown fields, columns, row counts, paths and table omissions.
  if (canonicalJson(input) !== canonicalJson(expected.manifest))
    throw new RebuildError("BACKUP_CONTENT_MISMATCH");
  for (const table of tableNames) {
    if (
      sha256(await regularFile(path.join(directory, `${table}.jsonl`))) !==
      expected.manifest.tables[table].sha256
    )
      throw new RebuildError("BACKUP_FILE_DIGEST_MISMATCH");
  }
  return expected.manifest;
}
