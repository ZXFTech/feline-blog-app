import "server-only";
import db from "@/db/client";
import type { Identity, ResolutionContext } from "@user-center/next-better-auth/server";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";

export const bootstrapEmail = "zxf_tech@outlook.com";
export class SdkHostError extends Error {
  constructor(
    public readonly code:
      | "INITIALIZATION_PENDING"
      | "PROFILE_REQUIRED"
      | "PROFILE_CONFLICT"
      | "INVALID_PROFILE"
      | "AUTH_UNAVAILABLE"
  ) {
    super(code);
  }
}
export const businessUserSelect = {
  id: true,
  username: true,
  profileEmailSnapshot: true,
  role: true,
  avatar: true,
  profileCompletedAt: true,
  profileEmailConfirmedAt: true,
  businessCreatedAt: true,
  businessUpdatedAt: true,
} as const;
type BusinessRow = NonNullable<Awaited<ReturnType<typeof readUser>>>;
function readUser(id: string) {
  return db.user.findUnique({ where: { id }, select: businessUserSelect });
}
export function projectBusinessUser(row: BusinessRow) {
  if (
    !row.profileCompletedAt ||
    !row.profileEmailSnapshot ||
    !row.profileEmailConfirmedAt ||
    !row.businessCreatedAt ||
    !row.businessUpdatedAt
  )
    return null;
  return {
    id: row.id,
    username: row.username,
    email: row.profileEmailSnapshot,
    role: row.role,
    avatar: row.avatar,
    createdAt: row.businessCreatedAt,
    updatedAt: row.businessUpdatedAt,
    authMode: "sdk" as const,
  };
}
export type SdkBusinessUser = NonNullable<ReturnType<typeof projectBusinessUser>>;
export async function resolveBusinessUser(identity: Identity, context: ResolutionContext) {
  if (context.signal.aborted) throw new SdkHostError("AUTH_UNAVAILABLE");
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new SdkHostError("AUTH_UNAVAILABLE"));
    context.signal.addEventListener("abort", abort, { once: true });
  });
  let row;
  try {
    row = await Promise.race([readUser(identity.authUserId), cancelled]);
  } finally {
    if (abort) context.signal.removeEventListener("abort", abort);
  }
  if (context.signal.aborted) throw new SdkHostError("AUTH_UNAVAILABLE");
  const user = row ? projectBusinessUser(row) : null;
  return user ? { status: "ready" as const, user } : { status: "unmapped" as const };
}
export async function readInstallation(client: Pick<typeof db, "authInstallState"> = db) {
  const state = await client.authInstallState.findUnique({
    where: { id: "primary" },
    include: { restoreRun: true },
  });
  if (
    !state ||
    !["awaiting_root", "awaiting_restore", "ready"].includes(state.phase) ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !state.targetGeneration
  )
    throw new SdkHostError("AUTH_UNAVAILABLE");
  if (
    state.phase !== "awaiting_root" &&
    (!state.rootUserId ||
      !state.rootInitializedAt ||
      state.rootIssuer !== getSdkConfiguration().manifest.issuer ||
      !state.rootSubjectDigest?.match(/^[a-f0-9]{64}$/) ||
      !state.bootstrapPlanDigest?.match(/^[a-f0-9]{64}$/))
  )
    throw new SdkHostError("AUTH_UNAVAILABLE");
  if (
    state.phase === "ready" &&
    (!state.restoreRunId ||
      !state.activatedAt ||
      !state.activationEvidenceRef ||
      !state.activationPlanDigest?.match(/^[a-f0-9]{64}$/) ||
      !state.activationEvidenceSha256?.match(/^[a-f0-9]{64}$/) ||
      state.restoreRun?.id !== state.restoreRunId ||
      state.restoreRun.targetGeneration !== state.targetGeneration ||
      state.restoreRun.targetUserId !== state.rootUserId)
  )
    throw new SdkHostError("AUTH_UNAVAILABLE");
  return state;
}
export async function assertBusinessReady() {
  if ((await readInstallation()).phase !== "ready")
    throw new SdkHostError("INITIALIZATION_PENDING");
}
export async function assertProfileStage(identity: Identity) {
  const state = await readInstallation();
  assertProfileAllowed(state, identity);
  return state;
}
export function assertProfileAllowed(
  state: Awaited<ReturnType<typeof readInstallation>>,
  identity: Identity
) {
  if (
    state.phase === "awaiting_root" &&
    identity.profile.email.trim().toLowerCase() !== bootstrapEmail
  )
    throw new SdkHostError("INITIALIZATION_PENDING");
  if (state.phase === "awaiting_restore" && state.rootUserId !== identity.authUserId)
    throw new SdkHostError("INITIALIZATION_PENDING");
}
