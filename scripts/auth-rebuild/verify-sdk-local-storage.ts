// Storage proof for the fixed isolated local target. Every fixture is rolled back.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma-postgres/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { assertPostgresBinding } from "@user-center/next-better-auth/config";
import { privateConfigFile } from "./files";

const directory = path.resolve(".feline-blog/auth-rebuild/local-0.1.6");
const proof: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  target: "127.0.0.1:54331/feline_blog_sdk_dev",
  backupExecuted: false,
  restoreExecuted: false,
};
const results: string[] = [];
let pool: pg.Pool | undefined;
let db: PrismaClient | undefined;
let maintenance: pg.Client | undefined;
let runtime: pg.Client | undefined;
const rolledBack = new Error("EXPECTED_FIXTURE_ROLLBACK");
async function main() {
  // Reuse the complete read only container/TLS/cluster/config/history binding check.
  const preflight = spawnSync(
    process.execPath,
    ["--import", "tsx", path.resolve("scripts/auth-rebuild/migrate-sdk-local.ts"), "status"],
    { encoding: "utf8", windowsHide: true, timeout: 90000 }
  );
  if (preflight.status !== 0) throw Error("LOCAL_STORAGE_PREFLIGHT_FAILED");
  const env = dotenv.parse(await privateConfigFile(path.join(directory, ".env.blog.local")));
  const profiles = JSON.parse(
    (await privateConfigFile(path.join(directory, "integration.profiles.json"))).toString("utf8")
  );
  const binding = profiles.runtimes.development.database;
  assertPostgresBinding(env.PLATFORM_DEVELOPMENT_DATABASE_URL, binding);
  assert.equal(binding.hostname, "127.0.0.1");
  assert.equal(binding.port, 54331);
  assert.equal(binding.database, "feline_blog_sdk_dev");
  assert.equal(binding.username, "blog_sdk_runtime");
  const maintenanceEnv = dotenv.parse(
    await privateConfigFile(path.join(directory, ".env.maintenance.local"))
  );
  const maintenanceBinding = JSON.parse(
    (await privateConfigFile(path.join(directory, "postgres/maintenance.binding.json"))).toString(
      "utf8"
    )
  );
  assertPostgresBinding(maintenanceEnv.POSTGRES_MIGRATION_URL, maintenanceBinding);
  const options = {
    connectionString: env.PLATFORM_DEVELOPMENT_DATABASE_URL,
    ssl: { ca: env.PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
  };
  pool = new pg.Pool({ ...options, max: 2 });
  db = new PrismaClient({ adapter: new PrismaPg(pool) });
  runtime = new pg.Client(options);
  maintenance = new pg.Client({
    connectionString: maintenanceEnv.POSTGRES_MIGRATION_URL,
    ssl: { ca: maintenanceEnv.POSTGRES_SSL_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
  });
  await runtime.connect();
  await maintenance.connect();
  const identity = (
    await runtime.query(
      "SELECT current_database() AS database,current_user AS username,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls"
    )
  ).rows[0];
  assert.equal(identity.database, "feline_blog_sdk_dev");
  assert.equal(identity.username, "blog_sdk_runtime");
  assert.equal(identity.tls, true);
  const counts = async () => ({
    users: await db!.user.count(),
    accounts: await db!.account.count(),
    sessions: await db!.session.count(),
    verifications: await db!.verification.count(),
    rates: await db!.authRateBucket.count(),
    receipts: await db!.businessRestoreRun.count(),
  });
  const before = await counts();
  assert.ok(Object.values(before).every((n) => n === 0));
  proof.before = before;
  const adapter = prismaAdapter(db, { provider: "postgresql", transaction: true })({
    emailAndPassword: { enabled: false },
  });
  const suffix = randomUUID();
  const oldDate = new Date("2000-01-01T00:00:00Z");
  try {
    await adapter.transaction(async (tx) => {
      const u = await tx.create<{
        id: string;
        updatedAt: Date;
        name: string;
        email: string;
        emailVerified: boolean;
      }>({
        model: "user",
        data: {
          name: "SDK storage proof",
          email: `sdk-${suffix}@example.invalid`,
          emailVerified: false,
          updatedAt: oldDate,
        },
      });
      assert.ok(u.id);
      results.push("adapter.user.create");
      const account = await tx.create<{
        id: string;
        updatedAt: Date;
        providerId: string;
        accountId: string;
        userId: string;
      }>({
        model: "account",
        data: {
          providerId: "offline-storage-proof",
          accountId: suffix,
          userId: u.id,
          updatedAt: oldDate,
        },
      });
      const updatedAccount = await tx.update<{ updatedAt: Date }>({
        model: "account",
        where: [{ field: "id", value: account.id }],
        update: { accessToken: "fixture-only" },
      });
      assert.ok(updatedAccount && new Date(updatedAccount.updatedAt) > oldDate);
      results.push("adapter.account.create-update");
      const updated = await tx.update<{ updatedAt: Date }>({
        model: "user",
        where: [{ field: "id", value: u.id }],
        update: { name: "Updated proof" },
      });
      assert.ok(updated && new Date(updated.updatedAt) > oldDate);
      results.push("adapter.user.updatedAt");
      const verification = await tx.create<{ id: string }>({
        model: "verification",
        data: {
          identifier: suffix,
          value: "fixture-only",
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      assert.ok(
        await tx.findOne({
          model: "verification",
          where: [{ field: "id", value: verification.id }],
        })
      );
      await tx.update({
        model: "verification",
        where: [{ field: "id", value: verification.id }],
        update: { value: "updated-fixture" },
      });
      await tx.delete({ model: "verification", where: [{ field: "id", value: verification.id }] });
      results.push("adapter.verification.crud");
      const session = await tx.create<{ id: string }>({
        model: "session",
        data: { userId: u.id, token: randomUUID(), expiresAt: new Date(Date.now() + 60000) },
      });
      assert.ok(
        await tx.findOne({ model: "session", where: [{ field: "id", value: session.id }] })
      );
      await tx.delete({ model: "session", where: [{ field: "id", value: session.id }] });
      results.push("adapter.session.create-read-delete");
      throw rolledBack;
    });
  } catch (error) {
    if (error !== rolledBack) throw Error("ADAPTER_CRUD_FAILED");
  }
  assert.deepEqual(await counts(), before);
  results.push("adapter.transaction.rollback");
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT public.feline_sdk_lock_installation()::text`;
      const state = await tx.authInstallState.findUnique({
        where: { id: "primary" },
        include: { restoreRun: true },
      });
      assert.equal(state?.phase, "awaiting_root");
      assert.equal(state?.restoreRun, null);
      const u = await tx.user.create({
        data: { email: `profile-${suffix}@example.invalid`, name: "Profile proof" },
      });
      await tx.$queryRaw`SELECT id FROM public.users WHERE id=${u.id} FOR UPDATE`;
      const now = new Date();
      await tx.user.update({
        where: { id: u.id },
        data: {
          username: "Profile proof",
          profileCompletedAt: now,
          profileEmailSnapshot: u.email,
          profileEmailConfirmedAt: now,
          businessCreatedAt: now,
          businessUpdatedAt: now,
        },
      });
      await tx.authRateBucket.upsert({
        where: {
          keyHash_operation_windowStart: {
            keyHash: suffix,
            operation: "sdk-proof",
            windowStart: oldDate,
          },
        },
        create: {
          keyHash: suffix,
          operation: "sdk-proof",
          windowStart: oldDate,
          count: 1,
          expiresAt: now,
        },
        update: { count: { increment: 1 } },
      });
      results.push("runtime.profile-lock-read-write-rate");
      throw rolledBack;
    });
  } catch (error) {
    if (error !== rolledBack) throw Error("PROFILE_STORAGE_FAILED");
  }
  // The lock helper blocks maintenance updates until the runtime transaction ends.
  await runtime.query("BEGIN");
  await runtime.query("SELECT public.feline_sdk_lock_installation()");
  await maintenance.query("BEGIN;SET LOCAL lock_timeout='150ms'");
  try {
    await maintenance.query(
      "UPDATE public.\"AuthInstallState\" SET revision=revision WHERE id='primary'"
    );
    throw Error("LOCK_NOT_ENFORCED");
  } catch (error) {
    if ((error as { code?: string }).code !== "55P03") throw error;
    results.push("installation-lock-blocks-maintenance");
  } finally {
    await maintenance.query("ROLLBACK");
    await runtime.query("ROLLBACK");
  }

  async function denied(name: string, sql: string, params: unknown[] = [], code = "42501") {
    await runtime!.query("BEGIN");
    try {
      await runtime!.query(sql, params);
      throw Error("EXPECTED_DENIAL_MISSING");
    } catch (error) {
      assert.equal((error as { code?: string }).code, code);
      results.push(name);
    } finally {
      await runtime!.query("ROLLBACK");
    }
  }
  for (const [name, sql] of [
    ["deny.user.role", "UPDATE public.users SET role='ROOT'"],
    ["deny.user.authMode", "UPDATE public.users SET \"authMode\"='legacy'"],
    ["deny.user.password", "UPDATE public.users SET password='fixture'"],
    ["deny.user.authVersion", 'UPDATE public.users SET "authVersion"=1'],
    ["deny.user.delete", "DELETE FROM public.users"],
    ["deny.installation.write", "UPDATE public.\"AuthInstallState\" SET phase='ready'"],
    ["deny.receipt.write", 'DELETE FROM public."BusinessRestoreRun"'],
    ["deny.legacy.sessions", "SELECT * FROM public.legacy_sessions"],
    ["deny.legacy.identities", "SELECT * FROM public.feline_auth_identity"],
    ["deny.legacy.verifications", "SELECT * FROM public.verification_tokens"],
    ["deny.cleanup.execute", "SELECT public.cleanup_auth_rows(1)"],
    ["deny.cron.execute", "SELECT auth_ops.cleanup_tick()"],
    ["deny.ddl", "CREATE TABLE public.sdk_forbidden(id int)"],
    ["deny.maintenance.role", "SET ROLE blog_sdk_migrator"],
  ])
    await denied(name, sql);
  // Direct SQL exercises database constraints with savepoints, leaving no fixture behind.
  await runtime.query("BEGIN");
  try {
    const userId = `proof-${suffix}`;
    await runtime.query(
      "INSERT INTO public.users(id,email,username,name,\"updatedAt\",\"updateAt\") VALUES($1,$2,'','proof',now(),now())",
      [userId, `sql-${suffix}@example.invalid`]
    );
    const secondUserId = `second-${suffix}`;
    await runtime.query(
      'INSERT INTO public.users(id,email,"updatedAt","updateAt") VALUES($1,$2,now(),now())',
      [secondUserId, `second-${suffix}@example.invalid`]
    );
    const rejects = async (name: string, sql: string, params: unknown[], code: string) => {
      await runtime!.query("SAVEPOINT negative_case");
      try {
        await runtime!.query(sql, params);
        throw Error("EXPECTED_CONSTRAINT_MISSING");
      } catch (error) {
        assert.equal((error as { code?: string }).code, code);
        results.push(name);
      } finally {
        await runtime!.query("ROLLBACK TO SAVEPOINT negative_case");
      }
    };
    await rejects(
      "constraint.email.unique",
      'INSERT INTO public.users(id,email,"updatedAt","updateAt") VALUES($1,$2,now(),now())',
      ["duplicate", `SQL-${suffix}@example.invalid`],
      "23505"
    );
    await rejects(
      "guard.insert.root",
      'INSERT INTO public.users(id,email,role,"updatedAt","updateAt") VALUES($1,$2,\'ROOT\',now(),now())',
      ["root-proof", `root-${suffix}@example.invalid`],
      "P0001"
    );
    await rejects(
      "guard.insert.legacy",
      'INSERT INTO public.users(id,email,"authMode",password,"updatedAt","updateAt") VALUES($1,$2,\'legacy\',\'fixture\',now(),now())',
      ["legacy-proof", `legacy-${suffix}@example.invalid`],
      "P0001"
    );
    const accountSql =
      'INSERT INTO public.auth_accounts(id,"providerId","accountId","userId","updatedAt") VALUES($1,$2,$3,$4,now())';
    await runtime.query(accountSql, ["account-proof", "proof", suffix, userId]);
    await rejects(
      "constraint.account.global-unique",
      accountSql,
      ["duplicate-account", "proof", suffix, secondUserId],
      "23505"
    );
    await rejects(
      "constraint.account.foreign-key",
      accountSql,
      ["orphan-account", "proof", "orphan", "missing-user"],
      "23503"
    );
    const sessionSql =
      'INSERT INTO public.sessions(id,token,"userId","expiresAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 minute\',now())';
    await runtime.query(sessionSql, ["session-proof", suffix, userId]);
    await rejects(
      "constraint.session.token-unique",
      sessionSql,
      ["duplicate-session", suffix, userId],
      "23505"
    );
    await rejects(
      "constraint.session.foreign-key",
      sessionSql,
      ["orphan-session", "orphan", "missing-user"],
      "23503"
    );
  } finally {
    await runtime.query("ROLLBACK");
  }
  const after = await counts();
  assert.deepEqual(after, before);
  proof.after = after;
  const installation = await db.authInstallState.findUnique({ where: { id: "primary" } });
  assert.equal(installation?.phase, "awaiting_root");
  assert.equal(installation?.revision, 0);
  assert.equal(installation?.rootUserId, null);
  assert.equal(installation?.restoreRunId, null);
  assert.equal(installation?.activatedAt, null);
  // The existing summary fails closed while cleanup has not been separately activated.
  try {
    await runtime.query("SELECT auth_ops.cleanup_status()");
    throw Error("INACTIVE_CLEANUP_ACCEPTED");
  } catch (error) {
    assert.equal((error as { code?: string }).code, "P0001");
    assert.equal((error as Error).message, "CLEANUP_NOT_ACTIVE");
    results.push("auth-ops.inactive-summary-fails-closed");
  }
  proof.checks = results;
  proof.passed = results.length;
  proof.fixtureRowsCommitted = 0;
  proof.status = "PASS";
  proof.completedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(directory, "postgres/migration-execution/storage-verification.json"),
    JSON.stringify(proof, null, 2) + "\n"
  );
  console.log(JSON.stringify(proof, null, 2));
}
try {
  await main();
} catch (error) {
  const code = (error as { code?: string }).code;
  console.error(
    JSON.stringify({
      status: "FAIL",
      phase: results.at(-1),
      code:
        typeof code === "string" && /^[A-Z0-9_]{5}$/.test(code)
          ? code
          : "STORAGE_VERIFICATION_FAILED",
      reason: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : undefined,
      passedChecks: results,
    })
  );
  process.exitCode = 1;
} finally {
  await runtime?.end().catch(() => {});
  await maintenance?.end().catch(() => {});
  await db?.$disconnect().catch(() => {});
  await pool?.end().catch(() => {});
}
