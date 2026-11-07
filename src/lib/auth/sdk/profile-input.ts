import { createHash } from "node:crypto";
export type ProfileInput =
  | {
      action: "complete-profile";
      username: string;
      emailConfirmed: true;
      emailSnapshotDigest: string;
      returnTo?: string;
    }
  | { action: "confirm-email"; emailConfirmed: true; emailSnapshotDigest: string };
export function emailSnapshotDigest(email: string): string {
  return createHash("sha256").update(email, "utf8").digest("hex");
}
export function parseProfileInput(input: unknown): ProfileInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const complete = value.action === "complete-profile";
  if (!complete && value.action !== "confirm-email") return null;
  const allowed = complete
    ? ["action", "username", "emailConfirmed", "emailSnapshotDigest", "returnTo"]
    : ["action", "emailConfirmed", "emailSnapshotDigest"];
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    value.emailConfirmed !== true ||
    typeof value.emailSnapshotDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.emailSnapshotDigest)
  )
    return null;
  if (!complete)
    return {
      action: "confirm-email",
      emailConfirmed: true,
      emailSnapshotDigest: value.emailSnapshotDigest,
    };
  if (
    typeof value.username !== "string" ||
    (value.returnTo !== undefined && typeof value.returnTo !== "string")
  )
    return null;
  const username = value.username.trim();
  if (
    Array.from(username).length < 1 ||
    Array.from(username).length > 64 ||
    /\p{Cc}/u.test(username)
  )
    return null;
  return {
    action: "complete-profile",
    username,
    emailConfirmed: true,
    emailSnapshotDigest: value.emailSnapshotDigest,
    ...(value.returnTo === undefined ? {} : { returnTo: value.returnTo as string }),
  };
}
