// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  emptyDataset,
  sha256,
  sourceEmail,
  tableNames,
  tables,
  type DataRow,
  type Dataset,
  type Table,
} from "./contracts";
import { assertBinding, assertFresh, parsePlan, sealPlan, type PlanBody } from "./maintenance-plan";
import { dataSummary, transformRestore, userChanges } from "./maintenance-data";
import { authFingerprint, transaction, type MaintenanceContext } from "./maintenance-store";
import { applyBootstrap } from "./maintenance";
import { parseMaintenanceArguments } from "./maintenance-cli";
import { assertBackupCutoff, assertSourceCutoff } from "./source-cutoff";
import { serializeBackup } from "./backup";
import { productionSourceFingerprint } from "./maintenance-store";

const now = new Date("2026-11-06T06:00:00.000Z"),
  digest = "a".repeat(64);
const base: PlanBody = {
  schemaVersion: 1,
  command: "bootstrap",
  databaseFingerprint: digest,
  databaseSchema: "feline_sdk_prod",
  targetGeneration: "12345678-1234-4234-8234-123456789012",
  runtimeEnvironment: "production",
  targetEnvironment: "production",
  expectedRevision: 0,
  issuer: "https://auth.example.test/api/auth",
  clientId: "dedicated",
  providerId: "user-center-test",
  authUserId: "new-user",
  operatorLabel: "explicit operator",
  inputs: {
    expectedRole: "USER",
    emailSnapshot: sourceEmail,
    subjectDigest: digest,
    authFingerprint: digest,
  },
};
const context = (query: MaintenanceContext["client"]["query"]): MaintenanceContext => ({
  client: { query },
  schema: "feline_sdk_prod",
  fingerprint: digest,
  issuer: base.issuer,
  clientId: base.clientId,
  providerId: base.providerId,
});
const row = (table: Table, values: DataRow): DataRow => ({
  ...Object.fromEntries(tables[table].map((column) => [column, null])),
  ...values,
});
function fixture(): Dataset {
  const d = emptyDataset();
  d.users = [
    row("users", {
      id: "source",
      email: sourceEmail,
      username: "old nickname",
      avatar: null,
      phone: null,
      work: "work",
      createdAt: now.toISOString(),
      updateAt: now.toISOString(),
    }),
  ];
  d.Blog = [row("Blog", { id: 7, authorId: "source", likeCount: 12, favoriteCount: 8 })];
  d.Tag = [row("Tag", { id: 3, userId: "source", content: "tag" })];
  d.Todo = [row("Todo", { id: 9, userId: "source" })];
  d.TagsOnBlogs = [row("TagsOnBlogs", { blogId: 7, tagId: 3, assignedBy: "source" })];
  d.TagsOnTodos = [row("TagsOnTodos", { todoId: 9, tagId: 3, assignedBy: "source" })];
  d.BlogLike = [row("BlogLike", { id: "like", blogId: 7, userId: "source" })];
  d.Checklist = [row("Checklist", { id: "list", userId: "source", createRequestId: "request" })];
  d.ChecklistItem = [row("ChecklistItem", { id: "item", checklistId: "list", createdOrder: 0 })];
  d.PomodoroRecord = [row("PomodoroRecord", { id: "pomo", userId: "source", eventId: "event" })];
  d.Exercise = [row("Exercise", { id: 2, name: "exercise" })];
  d.DailyStat = [row("DailyStat", { id: 1, date: now.toISOString() })];
  d.WorkoutItem = [row("WorkoutItem", { id: 4, exerciseId: 2, dailyStatId: 1 })];
  d.WorkoutSet = [row("WorkoutSet", { id: 5, workoutItemId: 4 })];
  d.Prompt = [row("Prompt", { id: 6 })];
  return d;
}
describe("maintenance plan validation", () => {
  it("binds digest to all inputs and retains a precise fifteen minute DB-clock window", () => {
    const p = sealPlan(base, now);
    expect(p.expiresAt).toBe("2026-11-06T06:15:00.000Z");
    expect(parsePlan(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() => parsePlan({ ...p, authUserId: "another" })).toThrow("MAINTENANCE_PLAN_REJECTED");
  });
  it.each(["unknown", "connectionString", "sql"])(
    "rejects extra field %s even with recomputed digest",
    (key) => {
      const { planDigest: _, ...body } = sealPlan(base, now);
      void _;
      const changed = { ...body, [key]: "injected" };
      expect(() => parsePlan({ ...changed, planDigest: sha256(canonicalJson(changed)) })).toThrow();
    }
  );
  it.each([new Date("2026-11-06T05:59:59.999Z"), new Date("2026-11-06T06:15:00.000Z")])(
    "rejects future or expired plans",
    (clock) =>
      expect(() => assertFresh(sealPlan(base, now), clock, 0)).toThrow("MAINTENANCE_PLAN_STALE")
  );
  it("rejects stale revisions and a different target generation", () => {
    const p = sealPlan(base, now);
    expect(() => assertFresh(p, now, 1)).toThrow();
    const {
      databaseSchema,
      databaseFingerprint,
      targetGeneration,
      runtimeEnvironment,
      targetEnvironment,
      issuer,
      clientId,
      providerId,
    } = p;
    expect(() =>
      assertBinding(p, {
        databaseSchema,
        databaseFingerprint,
        targetGeneration: targetGeneration.replace("12345678", "87654321"),
        runtimeEnvironment,
        targetEnvironment,
        issuer,
        clientId,
        providerId,
      })
    ).toThrow("MAINTENANCE_TARGET_MISMATCH");
  });
  it("requires explicit mode and rejects runtime fallback/unknown options", () => {
    expect(() => parseMaintenanceArguments(["bootstrap", "--env-file", "x"])).toThrow();
    expect(() =>
      parseMaintenanceArguments([
        "inspect",
        "--env-file",
        "a",
        "--runtime-env-file",
        "b",
        "--profiles-file",
        "c",
        "--database-url",
        "unsafe",
      ])
    ).toThrow();
  });
});
describe("single-account restoration", () => {
  it("maps every ownership edge, preserves source and business IDs, and recomputes scoped interactions", () => {
    const source = fixture(),
      before = canonicalJson(source),
      restored = transformRestore(source, "new-user");
    expect(canonicalJson(source)).toBe(before);
    expect(restored.data.users[0].id).toBe("new-user");
    expect(restored.data.Blog[0]).toMatchObject({
      id: 7,
      authorId: "new-user",
      likeCount: 1,
      favoriteCount: 0,
    });
    expect(restored.data.TagsOnTodos[0].assignedBy).toBe("new-user");
    expect(restored.data.PomodoroRecord[0].userId).toBe("new-user");
    expect(restored.sequenceMinimums).toMatchObject({ Blog: 7, Todo: 9, Tag: 3, Prompt: 6 });
    expect(restored.counterChanges).toEqual([
      { id: 7, oldLikes: 12, newLikes: 1, oldFavorites: 8, newFavorites: 0 },
    ]);
  });
  it("ignores row ordering but detects content tampering", () => {
    const data = fixture();
    data.Prompt.push(row("Prompt", { id: 10, content: "other" }));
    const summary = dataSummary(data);
    data.Prompt.reverse();
    expect(dataSummary(data)).toEqual(summary);
    data.Prompt[0].content = "changed";
    expect(dataSummary(data)).not.toEqual(summary);
  });
  it.each(["", " bad ", "x".repeat(65), "bad\nname"])(
    "rejects incompatible old nickname %j without silently changing it",
    (username) => {
      const d = fixture();
      d.users[0].username = username;
      expect(() => transformRestore(d, "new-user")).toThrow("RESTORE_PROFILE_REJECTED");
    }
  );
  it("rejects cross-account assignment and missing Workout logical reference", () => {
    const d = fixture();
    d.TagsOnBlogs[0].assignedBy = "other";
    expect(() => transformRestore(d, "new-user")).toThrow("ASSIGNED_BY_OUT_OF_SCOPE");
    d.TagsOnBlogs[0].assignedBy = "source";
    d.WorkoutItem[0].exerciseId = 999;
    expect(() => transformRestore(d, "new-user")).toThrow("REFERENCE_OUT_OF_SCOPE");
  });
  it("rejects composite uniqueness conflicts before import", () => {
    const d = fixture();
    d.PomodoroRecord.push({ ...d.PomodoroRecord[0], id: "different-id" });
    expect(() => transformRestore(d, "new-user")).toThrow("RESTORE_UNIQUE_CONFLICT");
  });
  it("accepts multiple NULL event IDs under PostgreSQL unique semantics", () => {
    const d = fixture();
    d.PomodoroRecord[0].eventId = null;
    d.PomodoroRecord.push({ ...d.PomodoroRecord[0], id: "old-without-event" });
    expect(transformRestore(d, "new-user").rowCounts.PomodoroRecord).toBe(2);
  });
  it("lists only six permitted User changes and keeps authentication fingerprint independent of them", () => {
    const source = fixture().users[0],
      current = {
        ...source,
        id: "new-user",
        role: "ROOT",
        name: "center",
        image: null,
        emailVerified: true,
        updatedAt: now,
        authMode: "sdk",
        authVersion: 0,
        no_password: true,
        profileCompletedAt: now,
        profileEmailSnapshot: sourceEmail,
        profileEmailConfirmedAt: now,
        businessCreatedAt: now,
        businessUpdatedAt: now,
      };
    const changes = userChanges(current, source);
    expect(Object.keys(changes).sort()).toEqual([
      "avatar",
      "businessCreatedAt",
      "businessUpdatedAt",
      "phone",
      "username",
      "work",
    ]);
    expect(authFingerprint({ ...current, username: "restored" })).toBe(authFingerprint(current));
    expect(authFingerprint({ ...current, email: "different@example.test" })).not.toBe(
      authFingerprint(current)
    );
  });
});
describe("transaction and cutoff safety", () => {
  it("rolls back a failed operation and never commits it", async () => {
    const calls: string[] = [];
    const c = context(async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM "feline_sdk_prod"."AuthInstallState"'))
        return {
          rows: [{ phase: "awaiting_root", revision: 0, targetGeneration: base.targetGeneration }],
        };
      if (sql.includes('FROM "feline_sdk_prod"."users"')) return { rows: [{ id: "new-user" }] };
      return { rows: [] };
    });
    await expect(
      transaction(c, "new-user", async () => {
        throw Error("failure");
      })
    ).rejects.toThrow("failure");
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(calls.findIndex((s) => s.includes("pg_advisory_xact_lock"))).toBeLessThan(
      calls.findIndex((s) => s.includes("FOR UPDATE"))
    );
  });
  it("refuses an expired bootstrap before any authority update", async () => {
    const calls: string[] = [];
    const c = context(async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM "feline_sdk_prod"."AuthInstallState"'))
        return {
          rows: [{ phase: "awaiting_root", revision: 0, targetGeneration: base.targetGeneration }],
        };
      if (sql.includes('FROM "feline_sdk_prod"."users"'))
        return { rows: [{ id: "new-user", role: "USER" }] };
      if (sql.includes("clock_timestamp() AS now"))
        return { rows: [{ now: new Date(now.getTime() + 900_000) }] };
      return { rows: [] };
    });
    const p = sealPlan(base, now);
    if (p.command !== "bootstrap") throw Error();
    await expect(applyBootstrap(c, p)).rejects.toThrow("MAINTENANCE_PLAN_STALE");
    expect(calls.some((s) => /^UPDATE/.test(s))).toBe(false);
  });
  it("completed bootstrap replay is read only even after expiry and revision advancement", async () => {
    const p = sealPlan(base, now);
    if (p.command !== "bootstrap") throw Error();
    const calls: string[] = [];
    const c = context(async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM "feline_sdk_prod"."AuthInstallState"'))
        return {
          rows: [
            {
              phase: "awaiting_restore",
              revision: 2,
              targetGeneration: base.targetGeneration,
              bootstrapPlanDigest: p.planDigest,
              rootUserId: p.authUserId,
              rootIssuer: p.issuer,
              rootSubjectDigest: p.inputs.subjectDigest,
              operatorLabel: p.operatorLabel,
            },
          ],
        };
      if (sql.includes('FROM "feline_sdk_prod"."users"'))
        return { rows: [{ id: p.authUserId, role: "ROOT" }] };
      return { rows: [] };
    });
    await expect(applyBootstrap(c, p)).resolves.toMatchObject({ code: "ALREADY_COMPLETE" });
    expect(calls.some((s) => /^UPDATE/.test(s))).toBe(false);
  });
  it("rejects a lost source freeze before target writes", async () => {
    const rows = tableNames
      .slice()
      .sort()
      .map((name, i) => ({ name, oid: i + 1 }));
    const c = context(async (sql) => ({
      rows: sql.includes("c.relname AS name") ? rows : [{ database_oid: 5, locked: 0 }],
    }));
    await expect(
      assertSourceCutoff(c, {
        backendPid: 123,
        databaseOid: 5,
        relationsDigest: sha256(canonicalJson(rows)),
        lockedAt: now.toISOString(),
      })
    ).rejects.toThrow("SOURCE_CUTOFF_LOST");
  });
  it("binds a backup to the exact frozen source, full content and file digest", () => {
    const id = "12345678-1234-4234-8234-123456789012";
    const manifest = serializeBackup(fixture(), id, productionSourceFingerprint).manifest;
    const proof = {
      backendPid: 123,
      databaseOid: 5,
      relationsDigest: digest,
      lockedAt: now.toISOString(),
      sourceFingerprint: productionSourceFingerprint,
      sourceContentDigest: manifest.contentDigest,
      backupId: id,
      manifestSha256: digest,
    };
    expect(() => assertBackupCutoff(manifest, id, digest, proof)).not.toThrow();
    for (const change of [
      { sourceFingerprint: "b".repeat(64) },
      { sourceContentDigest: "b".repeat(64) },
      { manifestSha256: "b".repeat(64) },
    ])
      expect(() => assertBackupCutoff(manifest, id, digest, { ...proof, ...change })).toThrow(
        "RESTORE_SOURCE_BINDING_REJECTED"
      );
  });
});
