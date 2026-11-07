// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { Identity } from "@user-center/next-better-auth/server";
import { Prisma } from "../../../../generated/prisma-postgres/client";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn(),
  user: vi.fn(),
  accounts: vi.fn(),
  update: vi.fn(),
  state: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  default: { $transaction: mocks.transaction, authRateBucket: { upsert: mocks.bucket } },
}));
vi.mock("@/lib/auth/sdk/config", () => ({
  getSdkDatabaseSchema: () => "public",
  getSdkConfiguration: () => ({
    manifest: {
      schemaVersion: 1,
      issuer: "https://center.example.test/api/auth",
      platformOrigin: "https://blog.example.test",
      clientId: "fixture",
      clientSecretEnv: "CLIENT",
      sessionSecretEnv: "SESSION",
      authBasePath: "/api/auth",
      errorPath: "/auth/error",
      returnTo: {
        fallback: "/profile",
        allowedPaths: ["/profile", "/todo"],
        allowedPathPrefixes: [],
        allowedQueryKeys: [],
      },
    },
    publicConfig: { providerId: "derived-provider" },
  }),
}));
import { consumeProfileRate, saveProfile, trustedProfileIp } from "./profile";
import { emailSnapshotDigest } from "./profile-input";
const identity: Identity = {
  issuer: "https://center.example.test/api/auth",
  subject: "subject",
  authUserId: "new-user",
  profile: { name: "Auth name", email: "zxf_tech@outlook.com", emailVerified: true },
};
const complete = () => ({
  action: "complete-profile" as const,
  username: "Reader",
  emailConfirmed: true as const,
  emailSnapshotDigest: emailSnapshotDigest(identity.profile.email),
  returnTo: "/todo",
});
const user = () => ({
  id: "new-user",
  username: "",
  email: identity.profile.email,
  role: "USER",
  avatar: null,
  profileCompletedAt: null,
  profileEmailSnapshot: null,
  profileEmailConfirmedAt: null,
  businessCreatedAt: null,
  businessUpdatedAt: null,
});
const completed = () => ({
  ...user(),
  username: "Existing",
  profileCompletedAt: new Date(),
  profileEmailSnapshot: "older@example.test",
  profileEmailConfirmedAt: new Date(),
  businessCreatedAt: new Date(),
  businessUpdatedAt: new Date(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.mockResolvedValue({
    id: "primary",
    phase: "awaiting_root",
    revision: 0,
    targetGeneration: "generation",
  });
  mocks.user.mockResolvedValue(user());
  mocks.accounts.mockResolvedValue([{ accountId: identity.subject }]);
  mocks.update.mockImplementation(async ({ data }) => ({ ...user(), ...data }));
  mocks.transaction.mockImplementation((callback) =>
    callback({
      $queryRaw: mocks.query,
      authInstallState: { findUnique: mocks.state },
      user: { findUnique: mocks.user, update: mocks.update },
      account: { findMany: mocks.accounts },
    })
  );
});
it("locks state before the user and writes only business fields to the authenticated ID", async () => {
  const result = await saveProfile(identity, complete());
  const stateLock = Prisma.sql(mocks.query.mock.calls[0][0], ...mocks.query.mock.calls[0].slice(1));
  const userLock = Prisma.sql(mocks.query.mock.calls[1][0], ...mocks.query.mock.calls[1].slice(1));
  expect(stateLock.sql).toContain('"public"."feline_sdk_lock_installation"()');
  expect(userLock.sql).toContain('"public"."users"');
  expect(userLock.values).toEqual(["new-user"]);
  const { where, data } = mocks.update.mock.calls[0][0];
  expect(where).toEqual({ id: "new-user" });
  expect(Object.keys(data).sort()).toEqual(
    [
      "username",
      "profileCompletedAt",
      "profileEmailSnapshot",
      "profileEmailConfirmedAt",
      "businessCreatedAt",
      "businessUpdatedAt",
    ].sort()
  );
  expect(data.profileEmailSnapshot).toBe(identity.profile.email);
  expect(result.returnTo).toBe("/todo");
});
it("returns the stored profile on repeat completion without overwriting it", async () => {
  mocks.user.mockResolvedValue(completed());
  expect(await saveProfile(identity, complete())).toMatchObject({
    user: { username: "Existing", email: "older@example.test" },
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("reconfirms only the current server email without changing nickname or role", async () => {
  mocks.user.mockResolvedValue(completed());
  mocks.update.mockImplementation(async ({ data }) => ({ ...completed(), ...data }));
  await saveProfile(identity, {
    action: "confirm-email",
    emailConfirmed: true,
    emailSnapshotDigest: complete().emailSnapshotDigest,
  });
  expect(Object.keys(mocks.update.mock.calls[0][0].data).sort()).toEqual(
    ["profileEmailSnapshot", "profileEmailConfirmedAt", "businessUpdatedAt"].sort()
  );
});
it("requires a completed profile before email reconfirmation", async () => {
  await expect(
    saveProfile(identity, {
      action: "confirm-email",
      emailConfirmed: true,
      emailSnapshotDigest: complete().emailSnapshotDigest,
    })
  ).rejects.toThrow("PROFILE_REQUIRED");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects stale confirmation, changed auth email, wrong subject and duplicate accounts", async () => {
  for (const scenario of ["digest", "email", "subject", "duplicate"]) {
    mocks.user.mockResolvedValue({
      ...user(),
      ...(scenario === "email" ? { email: "changed@example.test" } : {}),
    });
    mocks.accounts.mockResolvedValue(
      scenario === "duplicate"
        ? [{ accountId: "subject" }, { accountId: "other" }]
        : [{ accountId: scenario === "subject" ? "other" : "subject" }]
    );
    await expect(
      saveProfile(identity, {
        ...complete(),
        ...(scenario === "digest" ? { emailSnapshotDigest: "f".repeat(64) } : {}),
      })
    ).rejects.toThrow("PROFILE_CONFLICT");
  }
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects external return destinations before starting a transaction", async () => {
  await expect(
    saveProfile(identity, { ...complete(), returnTo: "https://outside.example.test" })
  ).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("uses atomic rate buckets and never trusts a browser supplied forwarded IP", async () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("FELINE_TRUSTED_PROXY", "");
  expect(
    trustedProfileIp(new Headers({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "192.0.2.2" }))
  ).toBe("no-trusted-ip");
  mocks.bucket.mockResolvedValue({ count: 6 });
  expect(await consumeProfileRate("new-user", "profile-user", 5)).toBe(false);
  expect(mocks.bucket.mock.calls[0][0].update).toEqual({ count: { increment: 1 } });
  vi.unstubAllEnvs();
});
