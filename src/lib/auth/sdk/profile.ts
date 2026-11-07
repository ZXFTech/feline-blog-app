import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { Identity } from "@user-center/next-better-auth/server";
import { validateReturnTo } from "@user-center/next-better-auth/public";
import db from "@/db/client";
import { applicationObject } from "@/db/postgres/schema";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import {
  assertProfileAllowed,
  businessUserSelect,
  projectBusinessUser,
  readInstallation,
  SdkHostError,
} from "@/lib/auth/sdk/business";
import { emailSnapshotDigest, type ProfileInput } from "@/lib/auth/sdk/profile-input";

export function trustedProfileIp(headers: Headers): string {
  const ip = headers.get("x-real-ip");
  return (process.env.VERCEL === "1" || process.env.FELINE_TRUSTED_PROXY === "true") &&
    ip &&
    isIP(ip)
    ? ip
    : "no-trusted-ip";
}
export async function consumeProfileRate(
  subject: string,
  operation: string,
  limit: number
): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const keyHash = createHash("sha256").update(`sdk/${operation}/${subject}`).digest("hex");
  const row = await db.authRateBucket.upsert({
    where: { keyHash_operation_windowStart: { keyHash, operation, windowStart } },
    create: {
      keyHash,
      operation,
      windowStart,
      count: 1,
      expiresAt: new Date(windowStart.getTime() + 120_000),
    },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count <= limit;
}
export async function saveProfile(identity: Identity, input: ProfileInput) {
  const config = getSdkConfiguration();
  const returnTo = validateReturnTo(
    input.action === "complete-profile" ? input.returnTo : undefined,
    config.manifest
  );
  return db.$transaction(
    async (tx) => {
      // Consistent order with maintenance: installation row, then the target User.
      await tx.$queryRaw`SELECT ${applicationObject("feline_sdk_lock_installation")}()::text`;
      const state = await readInstallation(tx);
      assertProfileAllowed(state, identity);
      await tx.$queryRaw`SELECT id FROM ${applicationObject("users")} WHERE id=${identity.authUserId} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: identity.authUserId },
        select: { ...businessUserSelect, email: true },
      });
      const accounts = await tx.account.findMany({
        where: { userId: identity.authUserId, providerId: config.publicConfig.providerId },
        select: { accountId: true },
      });
      if (
        !current ||
        accounts.length !== 1 ||
        accounts[0].accountId !== identity.subject ||
        current.email !== identity.profile.email
      )
        throw new SdkHostError("PROFILE_CONFLICT");
      if (emailSnapshotDigest(identity.profile.email) !== input.emailSnapshotDigest)
        throw new SdkHostError("PROFILE_CONFLICT");
      if (input.action === "complete-profile" && current.profileCompletedAt) {
        const user = projectBusinessUser(current);
        if (!user) throw new SdkHostError("AUTH_UNAVAILABLE");
        return { user, returnTo };
      }
      if (input.action === "confirm-email" && !current.profileCompletedAt)
        throw new SdkHostError("PROFILE_REQUIRED");
      const now = new Date();
      const update =
        input.action === "complete-profile"
          ? {
              username: input.username,
              profileCompletedAt: now,
              profileEmailSnapshot: identity.profile.email,
              profileEmailConfirmedAt: now,
              businessCreatedAt: now,
              businessUpdatedAt: now,
            }
          : {
              profileEmailSnapshot: identity.profile.email,
              profileEmailConfirmedAt: now,
              businessUpdatedAt: now,
            };
      const updated = await tx.user.update({
        where: { id: identity.authUserId },
        data: update,
        select: businessUserSelect,
      });
      const user = projectBusinessUser(updated);
      if (!user) throw new SdkHostError("AUTH_UNAVAILABLE");
      return { user, returnTo };
    },
    { maxWait: 3000, timeout: 5000 }
  );
}
