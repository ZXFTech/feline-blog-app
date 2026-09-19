import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import legacyDb from "../../src/db/legacy-mysql/client";
import { PrismaClient as PostgresClient } from "../../generated/prisma-postgres/client";
import { buildPostgresPoolConfig } from "../../src/db/postgres/config";

type Mode = "dry-run" | "apply" | "verify-only";

const mode = process.argv
  .find((argument): argument is `--${Mode}` =>
    ["--dry-run", "--apply", "--verify-only"].includes(argument)
  )
  ?.slice(2) as Mode | undefined;

if (!mode) throw new Error("Choose exactly one mode: --dry-run, --apply, or --verify-only.");
if (
  process.argv.filter((argument) => ["--dry-run", "--apply", "--verify-only"].includes(argument))
    .length !== 1
) {
  throw new Error("Choose exactly one migration mode.");
}

const allowedEnvironments = new Set(["development", "staging", "test"]);
const environment = process.env.POSTGRES_ENVIRONMENT?.toLowerCase();
if (!environment || !allowedEnvironments.has(environment)) {
  throw new Error("POSTGRES_ENVIRONMENT must be development, staging, or test.");
}
if (mode === "apply" && process.env.POSTGRES_MIGRATION_ALLOW_WRITE !== "true") {
  throw new Error("POSTGRES_MIGRATION_ALLOW_WRITE=true is required for --apply.");
}

function requireValue(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function targetIdentity(value: string) {
  const url = new URL(value);
  const usernameParts = decodeURIComponent(url.username).split(".");
  const tenant = url.hostname.includes("pooler.supabase.com")
    ? usernameParts.slice(1).join(".")
    : `${url.hostname}:${url.port || "5432"}`;
  return `${tenant}${url.pathname}`;
}

const runtimeUrl = requireValue("POSTGRES_DATABASE_URL");
const migrationUrl = requireValue("POSTGRES_MIGRATION_URL");
if (targetIdentity(runtimeUrl) !== targetIdentity(migrationUrl)) {
  throw new Error("Runtime and migration URLs must target the same staging database.");
}

const targetPool = new Pool(
  buildPostgresPoolConfig({
    ...process.env,
    POSTGRES_DATABASE_URL: migrationUrl,
    POSTGRES_POOL_MAX: "1",
    POSTGRES_CONNECT_TIMEOUT_MS: "30000",
    POSTGRES_QUERY_TIMEOUT_MS: "120000",
  })
);
const targetDb = new PostgresClient({ adapter: new PrismaPg(targetPool) });

const source = await readSnapshot(legacyDb);
validateSource(source);
printSummary("source", source);

try {
  if (mode === "dry-run") {
    console.log("Legacy to PostgreSQL dry run passed. No target rows were read or written.");
  } else if (mode === "verify-only") {
    const target = await readSnapshot(targetDb);
    assertSnapshotsMatch(source, target);
    console.log("Legacy to PostgreSQL verification passed. No target rows were written.");
  } else {
    const targetBefore = await readSnapshot(targetDb);
    const existingRows = totalRows(targetBefore);
    if (existingRows !== 0) {
      throw new Error(
        `PostgreSQL business tables contain ${existingRows} rows. Refusing to overwrite or upsert them.`
      );
    }

    await targetDb.$transaction(
      async (tx) => {
        await tx.user.createMany({ data: source.users });
        await tx.session.createMany({ data: source.sessions });
        await tx.verificationToken.createMany({ data: source.verificationTokens });
        await tx.blog.createMany({ data: source.blogs });
        await tx.tag.createMany({ data: source.tags });
        await tx.todo.createMany({ data: source.todos });
        await tx.dailyStat.createMany({ data: source.dailyStats });
        await tx.exercise.createMany({ data: source.exercises });
        await tx.prompt.createMany({ data: source.prompts });
        await tx.pomodoroRecord.createMany({ data: source.pomodoroRecords });
        await tx.tagsOnBlogs.createMany({ data: source.tagsOnBlogs });
        await tx.tagsOnTodos.createMany({ data: source.tagsOnTodos });
        await tx.blogLike.createMany({ data: source.blogLikes });
        await tx.blogFavorite.createMany({ data: source.blogFavorites });
        await tx.workoutItem.createMany({ data: source.workoutItems });
        await tx.workoutSet.createMany({ data: source.workoutSets });

        for (const [table, column] of [
          ["Blog", "id"],
          ["Tag", "id"],
          ["Todo", "id"],
          ["DailyStat", "id"],
          ["WorkoutItem", "id"],
          ["WorkoutSet", "id"],
          ["Exercise", "id"],
          ["Prompt", "id"],
        ] as const) {
          await tx.$executeRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('"${table}"', '${column}'), COALESCE(MAX("${column}"), 1), MAX("${column}") IS NOT NULL) FROM "${table}"`
          );
        }
      },
      { maxWait: 20_000, timeout: 120_000 }
    );

    const targetAfter = await readSnapshot(targetDb);
    assertSnapshotsMatch(source, targetAfter);
    console.log("Legacy MySQL data was copied to PostgreSQL and verified with no upserts.");
  }
} finally {
  await Promise.race([
    legacyDb.$disconnect(),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  await targetDb.$disconnect();
  await targetPool.end();
}

// The MariaDB driver can retain an idle handle after Prisma disconnects on Windows.
// All database cleanup above has completed (or reached its bounded wait), so terminate
// this one-shot CLI deterministically instead of leaving local verification hanging.
process.exit(0);

async function readSnapshot(db: typeof legacyDb | PostgresClient) {
  // Both generated clients share the migration model contract. Keep one typed read path so
  // the snapshot shape cannot drift between source and target verification.
  const client = db as typeof legacyDb;
  const users = await client.user.findMany({ orderBy: { id: "asc" } });
  const sessions = await client.session.findMany({ orderBy: { id: "asc" } });
  const verificationTokens = await client.verificationToken.findMany({
    orderBy: [{ identifier: "asc" }, { token: "asc" }],
  });
  const blogs = await client.blog.findMany({ orderBy: { id: "asc" } });
  const tags = await client.tag.findMany({ orderBy: { id: "asc" } });
  const todos = await client.todo.findMany({ orderBy: { id: "asc" } });
  const tagsOnTodos = await client.tagsOnTodos.findMany({
    orderBy: [{ todoId: "asc" }, { tagId: "asc" }],
  });
  const tagsOnBlogs = await client.tagsOnBlogs.findMany({
    orderBy: [{ blogId: "asc" }, { tagId: "asc" }],
  });
  const blogLikes = await client.blogLike.findMany({ orderBy: { id: "asc" } });
  const blogFavorites = await client.blogFavorite.findMany({ orderBy: { id: "asc" } });
  const dailyStats = await client.dailyStat.findMany({ orderBy: { id: "asc" } });
  const workoutItems = await client.workoutItem.findMany({ orderBy: { id: "asc" } });
  const workoutSets = await client.workoutSet.findMany({ orderBy: { id: "asc" } });
  const exercises = await client.exercise.findMany({ orderBy: { id: "asc" } });
  const prompts = await client.prompt.findMany({ orderBy: { id: "asc" } });
  const pomodoroRecords = await client.pomodoroRecord.findMany({ orderBy: { id: "asc" } });
  return {
    users,
    sessions,
    verificationTokens,
    blogs,
    tags,
    todos,
    tagsOnTodos,
    tagsOnBlogs,
    blogLikes,
    blogFavorites,
    dailyStats,
    workoutItems,
    workoutSets,
    exercises,
    prompts,
    pomodoroRecords,
  };
}

type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;

function validateSource(snapshot: Snapshot) {
  const userIds = new Set(snapshot.users.map((row) => row.id));
  const blogIds = new Set(snapshot.blogs.map((row) => row.id));
  const tagIds = new Set(snapshot.tags.map((row) => row.id));
  const todoIds = new Set(snapshot.todos.map((row) => row.id));
  const dailyStatIds = new Set(snapshot.dailyStats.map((row) => row.id));
  const exerciseIds = new Set(snapshot.exercises.map((row) => row.id));
  const workoutItemIds = new Set(snapshot.workoutItems.map((row) => row.id));

  const invalid = [
    ...snapshot.sessions.filter((row) => !userIds.has(row.userId)).map(() => "sessions.userId"),
    ...snapshot.blogs.filter((row) => !userIds.has(row.authorId)).map(() => "Blog.authorId"),
    ...snapshot.tags.filter((row) => !userIds.has(row.userId)).map(() => "Tag.userId"),
    ...snapshot.todos.filter((row) => !userIds.has(row.userId)).map(() => "Todo.userId"),
    ...snapshot.tagsOnBlogs
      .filter((row) => !blogIds.has(row.blogId) || !tagIds.has(row.tagId))
      .map(() => "TagsOnBlogs"),
    ...snapshot.tagsOnTodos
      .filter((row) => !todoIds.has(row.todoId) || !tagIds.has(row.tagId))
      .map(() => "TagsOnTodos"),
    ...snapshot.blogLikes
      .filter((row) => !blogIds.has(row.blogId) || !userIds.has(row.userId))
      .map(() => "BlogLike"),
    ...snapshot.blogFavorites
      .filter((row) => !blogIds.has(row.blogId) || !userIds.has(row.userId))
      .map(() => "BlogFavorite"),
    ...snapshot.workoutItems
      .filter((row) => !dailyStatIds.has(row.dailyStatId) || !exerciseIds.has(row.exerciseId))
      .map(() => "WorkoutItem"),
    ...snapshot.workoutSets
      .filter((row) => !workoutItemIds.has(row.workoutItemId))
      .map(() => "WorkoutSet"),
    ...snapshot.pomodoroRecords
      .filter((row) => !userIds.has(row.userId))
      .map(() => "PomodoroRecord.userId"),
  ];
  if (invalid.length) {
    throw new Error(`Source referential integrity failed: ${[...new Set(invalid)].join(", ")}.`);
  }
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (item instanceof Date ? item.toISOString() : item));
}

function digest(rows: unknown[]) {
  return createHash("sha256").update(canonical(rows)).digest("hex");
}

function summary(snapshot: Snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([name, rows]) => [
      name,
      { count: rows.length, digest: digest(rows) },
    ])
  );
}

function printSummary(label: string, snapshot: Snapshot) {
  console.log(`${label} migration summary:`);
  for (const [name, value] of Object.entries(summary(snapshot))) {
    console.log(`  ${name}: count=${value.count}, sha256=${value.digest}`);
  }
}

function totalRows(snapshot: Snapshot) {
  return Object.values(snapshot).reduce((total, rows) => total + rows.length, 0);
}

function assertSnapshotsMatch(sourceSnapshot: Snapshot, targetSnapshot: Snapshot) {
  const sourceSummary = summary(sourceSnapshot);
  const targetSummary = summary(targetSnapshot);
  printSummary("target", targetSnapshot);
  for (const name of Object.keys(sourceSummary)) {
    const sourceValue = sourceSummary[name]!;
    const targetValue = targetSummary[name]!;
    if (sourceValue.count !== targetValue.count || sourceValue.digest !== targetValue.digest) {
      throw new Error(
        `${name} verification failed: source count=${sourceValue.count}, target count=${targetValue.count}.`
      );
    }
  }
}
