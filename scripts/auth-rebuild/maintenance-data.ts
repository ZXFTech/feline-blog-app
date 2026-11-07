import { verifyBackup, type BackupManifest } from "./backup";
import { insideState, regularFile } from "./files";
import {
  assertClosure,
  canonicalJson,
  emptyDataset,
  mapTables,
  RebuildError,
  sha256,
  tableContents,
  tableNames,
  type DataRow,
  type Dataset,
  type Table,
} from "./contracts";
import { serialTables, userColumns } from "./maintenance-plan";

export const insertOrder: Exclude<Table, "users">[] = [
  "Exercise",
  "DailyStat",
  "Prompt",
  "WorkoutItem",
  "WorkoutSet",
  "Blog",
  "Tag",
  "Todo",
  "Checklist",
  "PomodoroRecord",
  "ChecklistItem",
  "TagsOnBlogs",
  "TagsOnTodos",
  "BlogLike",
  "BlogFavorite",
];
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();
export function normalizedRow(row: DataRow): DataRow {
  return JSON.parse(canonicalJson(row)) as DataRow;
}
export function dataSummary(data: Dataset) {
  const entries = mapTables((table) => ({
    rowCount: data[table].length,
    sha256: sha256(tableContents(table, data[table])),
  }));
  return {
    rowCounts: mapTables((table) => entries[table].rowCount),
    contentDigest: sha256(canonicalJson(entries)),
  };
}
export async function readBackupData(
  backupId: string,
  manifestSha256: string
): Promise<{ manifest: BackupManifest; data: Dataset }> {
  const manifest = await verifyBackup(backupId, manifestSha256),
    data = emptyDataset();
  for (const table of tableNames) {
    const contents = (
      await regularFile(insideState("backups", backupId, `${table}.jsonl`))
    ).toString("utf8");
    data[table] = contents
      ? contents
          .trimEnd()
          .split("\n")
          .map((line) => JSON.parse(line) as DataRow)
      : [];
  }
  return { manifest, data };
}
export function assertCombinations(data: Dataset): void {
  const combinations: [Table, string[]][] = [
    ["Tag", ["userId", "content"]],
    ["Checklist", ["userId", "createRequestId"]],
    ["ChecklistItem", ["checklistId", "createdOrder"]],
    ["PomodoroRecord", ["userId", "eventId"]],
    ["BlogLike", ["blogId", "userId"]],
    ["BlogFavorite", ["blogId", "userId"]],
    ["DailyStat", ["date"]],
    ["WorkoutItem", ["dailyStatId", "exerciseId"]],
  ];
  for (const [table, columns] of combinations) {
    const keys = data[table]
      .filter((row) => columns.every((key) => row[key] !== null))
      .map((row) => canonicalJson(columns.map((key) => row[key])));
    if (new Set(keys).size !== keys.length) throw new RebuildError("RESTORE_UNIQUE_CONFLICT");
  }
  const exerciseNames = data.Exercise.map((row) => {
    if (typeof row.name !== "string") throw new RebuildError("RESTORE_VALUE_REJECTED");
    return row.name.toLowerCase();
  });
  if (new Set(exerciseNames).size !== exerciseNames.length)
    throw new RebuildError("RESTORE_UNIQUE_CONFLICT");
}
export function transformRestore(source: Dataset, targetUserId: string) {
  const sourceId = source.users[0]?.id;
  if (typeof sourceId !== "string" || !targetUserId || sourceId === targetUserId)
    throw new RebuildError("RESTORE_USER_MAPPING_REJECTED");
  assertClosure(source, sourceId);
  assertCombinations(source);
  const data = structuredClone(source),
    profile = data.users[0];
  if (
    typeof profile.username !== "string" ||
    !profile.username.trim() ||
    profile.username !== profile.username.trim() ||
    Array.from(profile.username).length > 64 ||
    /[\u0000-\u001f\u007f]/u.test(profile.username)
  )
    throw new RebuildError("RESTORE_PROFILE_REJECTED");
  for (const column of ["createdAt", "updateAt"] as const)
    if (
      typeof profile[column] !== "string" ||
      !Number.isFinite(Date.parse(profile[column] as string))
    )
      throw new RebuildError("RESTORE_PROFILE_REJECTED");
  profile.id = targetUserId;
  for (const table of [
    "Blog",
    "Tag",
    "Todo",
    "Checklist",
    "PomodoroRecord",
    "BlogLike",
    "BlogFavorite",
  ] as const)
    for (const row of data[table]) row[table === "Blog" ? "authorId" : "userId"] = targetUserId;
  for (const table of ["TagsOnBlogs", "TagsOnTodos"] as const)
    for (const row of data[table]) row.assignedBy = targetUserId;
  const counterChanges = [];
  for (const row of data.Blog) {
    const likes = data.BlogLike.filter((item) => item.blogId === row.id).length;
    const favorites = data.BlogFavorite.filter((item) => item.blogId === row.id).length;
    if (
      !Number.isSafeInteger(row.likeCount) ||
      !Number.isSafeInteger(row.favoriteCount) ||
      Number(row.likeCount) < 0 ||
      Number(row.favoriteCount) < 0
    )
      throw new RebuildError("RESTORE_VALUE_REJECTED");
    if (row.likeCount !== likes || row.favoriteCount !== favorites)
      counterChanges.push({
        id: Number(row.id),
        oldLikes: Number(row.likeCount),
        newLikes: likes,
        oldFavorites: Number(row.favoriteCount),
        newFavorites: favorites,
      });
    row.likeCount = likes;
    row.favoriteCount = favorites;
  }
  const sequenceMinimums = Object.fromEntries(
    serialTables.map((table) => {
      const ids = data[table].map((row) => row.id);
      if (ids.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1))
        throw new RebuildError("RESTORE_SEQUENCE_ID_REJECTED");
      return [table, Math.max(0, ...(ids as number[]))];
    })
  ) as Record<(typeof serialTables)[number], number>;
  assertClosure(data, targetUserId);
  assertCombinations(data);
  return {
    data,
    counterChanges: counterChanges.sort((a, b) => a.id - b.id),
    sequenceMinimums,
    ...dataSummary(data),
  };
}
export function userChanges(current: DataRow, source: DataRow) {
  const after: Record<(typeof userColumns)[number], unknown> = {
    username: source.username,
    avatar: source.avatar,
    phone: source.phone,
    work: source.work,
    businessCreatedAt: source.createdAt,
    businessUpdatedAt: source.updateAt,
  };
  return Object.fromEntries(
    userColumns.map((column) => [
      column,
      { before: normalizedRow(current)[column], after: after[column] },
    ])
  ) as Record<(typeof userColumns)[number], { before: string | null; after: string | null }>;
}
