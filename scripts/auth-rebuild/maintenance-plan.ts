import { z } from "zod";
import { canonicalJson, RebuildError, sha256, tableNames, type Table } from "./contracts";

export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const uuidSchema = z.string().uuid();
const text = z
  .string()
  .min(1)
  .max(191)
  .refine((v) => !/[\u0000-\u001f\u007f]/u.test(v));
const integer = z.number().int().nonnegative().safe();
const timestamp = z.string().refine((v) => {
  try {
    return new Date(v).toISOString() === v;
  } catch {
    return false;
  }
});
const tableEnum = z.enum(tableNames as [Table, ...Table[]]);
export const countsSchema = z.record(tableEnum, integer);
export const filesSchema = z.record(tableEnum, digestSchema);
export const userColumns = [
  "username",
  "avatar",
  "phone",
  "work",
  "businessCreatedAt",
  "businessUpdatedAt",
] as const;
const scalar = z.string().nullable();
export const changesSchema = z.record(
  z.enum(userColumns),
  z.object({ before: scalar, after: scalar }).strict()
);
export const serialTables = [
  "Blog",
  "Tag",
  "Todo",
  "DailyStat",
  "WorkoutItem",
  "WorkoutSet",
  "Exercise",
  "Prompt",
] as const;
export const sequenceSchema = z.record(z.enum(serialTables), integer);
export const cutoffSchema = z
  .object({
    backendPid: integer.positive(),
    databaseOid: integer.positive(),
    relationsDigest: digestSchema,
    lockedAt: timestamp,
    sourceFingerprint: digestSchema,
    sourceContentDigest: digestSchema,
    backupId: uuidSchema,
    manifestSha256: digestSchema,
  })
  .strict();
export type SourceCutoff = z.infer<typeof cutoffSchema>;
const base = {
  schemaVersion: z.literal(1),
  databaseFingerprint: digestSchema,
  databaseSchema: z.enum(["public", "feline_sdk_prod"]),
  targetGeneration: uuidSchema,
  runtimeEnvironment: z.enum(["development", "staging", "production"]),
  targetEnvironment: z.enum(["development", "staging", "production"]),
  expectedRevision: integer,
  issuer: z.string().url(),
  clientId: text,
  providerId: text,
  authUserId: text,
  operatorLabel: text,
  issuedAt: timestamp,
  expiresAt: timestamp,
  planDigest: digestSchema,
};
const counterSchema = z
  .object({
    id: integer,
    oldLikes: integer,
    newLikes: integer,
    oldFavorites: integer,
    newFavorites: integer,
  })
  .strict();
export const planSchema = z.discriminatedUnion("command", [
  z
    .object({
      ...base,
      command: z.literal("bootstrap"),
      inputs: z
        .object({
          expectedRole: z.literal("USER"),
          emailSnapshot: z.string().email(),
          subjectDigest: digestSchema,
          authFingerprint: digestSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      command: z.literal("restore"),
      inputs: z
        .object({
          backupId: uuidSchema,
          manifestSha256: digestSchema,
          sourceFingerprint: digestSchema,
          sourceUserId: text,
          sourceContentDigest: digestSchema,
          files: filesSchema,
          rowCounts: countsSchema,
          contentDigest: digestSchema,
          userChanges: changesSchema,
          counterChanges: z.array(counterSchema),
          sequenceMinimums: sequenceSchema,
          authFingerprint: digestSchema,
          sourceCutoff: cutoffSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      command: z.literal("activate"),
      inputs: z
        .object({
          restoreRunId: uuidSchema,
          receiptDigest: digestSchema,
          evidenceRef: text,
          evidenceSha256: digestSchema,
        })
        .strict(),
    })
    .strict(),
]);
export type MaintenancePlan = z.infer<typeof planSchema>;
export type PlanBody = MaintenancePlan extends infer P
  ? P extends MaintenancePlan
    ? Omit<P, "issuedAt" | "expiresAt" | "planDigest">
    : never
  : never;
export type PlanBinding = Pick<
  MaintenancePlan,
  | "databaseFingerprint"
  | "databaseSchema"
  | "targetGeneration"
  | "issuer"
  | "clientId"
  | "providerId"
  | "runtimeEnvironment"
  | "targetEnvironment"
>;
export function parsePlan(input: unknown): MaintenancePlan {
  try {
    const parsed = planSchema.parse(input);
    const { planDigest, ...body } = parsed;
    if (
      sha256(canonicalJson(body)) !== planDigest ||
      Date.parse(parsed.expiresAt) - Date.parse(parsed.issuedAt) !== 900_000
    )
      throw Error();
    return parsed;
  } catch {
    throw new RebuildError("MAINTENANCE_PLAN_REJECTED");
  }
}
export function sealPlan(body: PlanBody, databaseNow: Date): MaintenancePlan {
  const value = {
    ...body,
    issuedAt: databaseNow.toISOString(),
    expiresAt: new Date(databaseNow.getTime() + 900_000).toISOString(),
  };
  return parsePlan({ ...value, planDigest: sha256(canonicalJson(value)) });
}
export function assertBinding(plan: MaintenancePlan, binding: PlanBinding): void {
  for (const key of Object.keys(binding) as (keyof PlanBinding)[])
    if (plan[key] !== binding[key]) throw new RebuildError("MAINTENANCE_TARGET_MISMATCH");
}
export function assertFresh(plan: MaintenancePlan, databaseNow: Date, revision: number): void {
  if (
    databaseNow.getTime() < Date.parse(plan.issuedAt) ||
    databaseNow.getTime() >= Date.parse(plan.expiresAt) ||
    plan.expectedRevision !== revision
  )
    throw new RebuildError("MAINTENANCE_PLAN_STALE");
}
export const evidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    targetGeneration: uuidSchema,
    rootUserId: text,
    restoreRunId: uuidSchema,
    manifestSha256: digestSchema,
    contentDigest: digestSchema,
    authentication: z.literal("passed"),
    root: z.literal("passed"),
    restoration: z.literal("passed"),
    sourceCutoff: z.literal("locked-final-snapshot"),
    sourceCutoffProof: cutoffSchema,
    rehearsal: z.union([
      z.object({ status: z.literal("passed"), evidenceRef: text }).strict(),
      z.object({ status: z.literal("not-run"), authorization: text }).strict(),
    ]),
    reviewedAt: timestamp,
    operatorLabel: text,
  })
  .strict();
