import { createHash } from "node:crypto";

export const sourceEmail = "zxf_tech@outlook.com";
// Immutable historical 0.1.6 delivery, used only by explicit archive preparation.
// Current registry dependency versions are checked by check-installed.ts.
export const sdkVersion = "0.1.6";
export const releaseFiles = {
  "user-center-next-better-auth-0.1.6.tgz":
    "71d123c06eafa96f44af0271a6cb1d272bfdd73d0bd9a9e4fd93859c01e62686",
  "user-center-cli-0.1.6.tgz": "4042cdee4e090abdcfdf5cf6989976ab9c3d833667acefeb0b4493ec5ecc8f35",
  "release-manifest.json": "9d4a2ee9f84e0e6e1a7834c45a744d0f112e63d24e638638369848cf51eaaef7",
} as const;

// The source User is deliberately a business projection, never a whole auth row.
export const tables = {
  users: ["id", "email", "username", "avatar", "phone", "work", "createdAt", "updateAt"],
  Blog: [
    "id",
    "authorId",
    "title",
    "content",
    "createdAt",
    "updatedAt",
    "delete",
    "likeCount",
    "favoriteCount",
  ],
  Tag: ["id", "content", "color", "createdAt", "updatedAt", "userId"],
  Todo: ["id", "content", "finished", "createAt", "updateAt", "finishedAt", "delete", "userId"],
  Checklist: [
    "id",
    "userId",
    "createRequestId",
    "createPayloadHash",
    "name",
    "themeColor",
    "expiresAt",
    "revision",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ],
  ChecklistItem: [
    "id",
    "checklistId",
    "detail",
    "confirmedAt",
    "createdOrder",
    "revision",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ],
  PomodoroRecord: [
    "id",
    "userId",
    "type",
    "eventId",
    "endReason",
    "finished",
    "summary",
    "startAt",
    "endAt",
    "durationMs",
    "actualDurationMs",
    "createAt",
    "updateAt",
  ],
  TagsOnBlogs: ["blogId", "tagId", "assignedAt", "assignedBy"],
  TagsOnTodos: ["todoId", "tagId", "assignedAt", "assignedBy"],
  BlogLike: ["id", "blogId", "userId", "createdAt"],
  BlogFavorite: ["id", "blogId", "userId", "createdAt"],
  DailyStat: ["id", "date", "typingCount", "stepCount", "createdAt", "updatedAt"],
  Exercise: ["id", "name"],
  WorkoutItem: ["id", "name", "exerciseId", "dailyStatId", "createdAt"],
  WorkoutSet: ["id", "reps", "order", "weight", "duration", "calories", "workoutItemId"],
  Prompt: ["id", "content", "platform", "originId", "imageUrl", "marks"],
} as const;

export type Table = keyof typeof tables;
export const tableNames = Object.keys(tables) as Table[];
export const sharedTables = [
  "DailyStat",
  "WorkoutItem",
  "WorkoutSet",
  "Exercise",
  "Prompt",
] as const;
export type DataRow = Record<string, unknown>;
export type Dataset = Record<Table, DataRow[]>;

export function mapTables<T>(create: (table: Table) => T): Record<Table, T> {
  return Object.fromEntries(tableNames.map((table) => [table, create(table)])) as Record<Table, T>;
}

export class RebuildError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RebuildError";
  }
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalized(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, normalized(item)])
    );
  }
  throw new RebuildError("INVALID_SERIALIZED_VALUE");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalized(value));
}

export function databaseFingerprint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RebuildError("INVALID_DATABASE_CONFIG");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.search ||
    url.hash ||
    url.pathname.length < 2
  ) {
    throw new RebuildError("INVALID_DATABASE_CONFIG");
  }
  return sha256(
    canonicalJson({
      host: url.hostname.toLowerCase(),
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.slice(1)),
    })
  );
}

export function emptyDataset(): Dataset {
  return mapTables<DataRow[]>(() => []);
}

export function assertColumns(table: Table, row: DataRow): void {
  const actual = Object.keys(row).sort();
  const expected = [...tables[table]].sort();
  if (canonicalJson(actual) !== canonicalJson(expected))
    throw new RebuildError("COLUMN_ALLOWLIST_MISMATCH");
}

function rowId(row: DataRow, field = "id"): string {
  const value = row[field];
  if (
    (typeof value !== "string" || !value) &&
    (typeof value !== "number" || !Number.isSafeInteger(value))
  ) {
    throw new RebuildError("INVALID_REFERENCE_VALUE");
  }
  return `${typeof value}:${value}`;
}

export function assertClosure(data: Dataset, userId: string): void {
  for (const table of tableNames) for (const row of data[table]) assertColumns(table, row);
  if (
    data.users.length !== 1 ||
    data.users[0].id !== userId ||
    data.users[0].email !== sourceEmail
  ) {
    throw new RebuildError("SOURCE_USER_MISMATCH");
  }
  const ids = Object.fromEntries(
    tableNames.map((table) => [
      table,
      new Set(
        data[table].map((row) =>
          table === "TagsOnBlogs"
            ? `${rowId(row, "blogId")}/${rowId(row, "tagId")}`
            : table === "TagsOnTodos"
              ? `${rowId(row, "todoId")}/${rowId(row, "tagId")}`
              : rowId(row)
        )
      ),
    ])
  ) as Record<Table, Set<string>>;
  for (const table of tableNames)
    if (ids[table].size !== data[table].length) throw new RebuildError("DUPLICATE_PRIMARY_KEY");
  for (const table of [
    "Blog",
    "Tag",
    "Todo",
    "Checklist",
    "PomodoroRecord",
    "BlogLike",
    "BlogFavorite",
  ] as const) {
    for (const row of data[table])
      if (row[table === "Blog" ? "authorId" : "userId"] !== userId)
        throw new RebuildError("OWNER_OUT_OF_SCOPE");
  }
  const references: [Table, string, Table][] = [
    ["TagsOnBlogs", "blogId", "Blog"],
    ["TagsOnBlogs", "tagId", "Tag"],
    ["TagsOnTodos", "todoId", "Todo"],
    ["TagsOnTodos", "tagId", "Tag"],
    ["BlogLike", "blogId", "Blog"],
    ["BlogFavorite", "blogId", "Blog"],
    ["ChecklistItem", "checklistId", "Checklist"],
    ["WorkoutItem", "dailyStatId", "DailyStat"],
    ["WorkoutItem", "exerciseId", "Exercise"],
    ["WorkoutSet", "workoutItemId", "WorkoutItem"],
  ];
  for (const [table, column, parent] of references) {
    for (const row of data[table])
      if (!ids[parent].has(rowId(row, column))) throw new RebuildError("REFERENCE_OUT_OF_SCOPE");
  }
  for (const table of ["TagsOnBlogs", "TagsOnTodos"] as const) {
    for (const row of data[table])
      if (row.assignedBy !== userId) throw new RebuildError("ASSIGNED_BY_OUT_OF_SCOPE");
  }
}

export function tableContents(table: Table, rows: DataRow[]): string {
  const serialized = rows
    .map((row) => {
      assertColumns(table, row);
      return canonicalJson(row);
    })
    .sort();
  return serialized.length ? `${serialized.join("\n")}\n` : "";
}
