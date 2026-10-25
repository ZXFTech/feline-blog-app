// @vitest-environment node
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".feline-blog/test.env", quiet: true });
const adminUrl = process.env.FELINE_AUTH_TEST_DATABASE_URL;
const runtimeUrl = process.env.FELINE_AUTH_TEST_RUNTIME_URL;
const enabled = !!adminUrl && !!runtimeUrl;
let admin: Pool, runtime: Pool;
beforeAll(async () => {
  if (!enabled) return;
  for (const value of [adminUrl, runtimeUrl]) {
    const url = new URL(value!);
    if (url.hostname !== "127.0.0.1" || !(url.port === "54341" || url.port === "54346" && process.env.FELINE_AUTH_TEST_OWNER === "oauth-post-20261019") || url.pathname !== "/feline_blog_dev") throw new Error("Only the dedicated isolated fixture is permitted");
  }
  admin = new Pool({ connectionString: adminUrl, max: 4 }); runtime = new Pool({ connectionString: runtimeUrl, max: 4 });
});
afterAll(async () => { await admin?.end(); await runtime?.end(); });
async function fixture(purpose = "bind", userId?: string, subject = randomUUID(), expired = false, validForSeconds = 300) {
  const user = userId ?? randomUUID(), browser = randomUUID(), flow = randomUUID();
  if (!userId) await admin.query(`INSERT INTO users(id,email,username,password,role,"updateAt") VALUES($1,$2,'Original cat','fixture-hash','ROOT',now())`, [user, user + "@fixture.test"]);
  await runtime.query("INSERT INTO feline_auth_browser(id,browser_token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')", [browser, randomUUID()]);
  await runtime.query(`INSERT INTO feline_auth_flow(id,purpose,state_hash,browser_state_id,browser_epoch,candidate_encrypted,candidate_digest,confirmation_revision,created_at,expires_at,status,legacy_user_id,legacy_auth_version,legacy_verified_at,require_fresh_auth,reauth_after,destination)
    VALUES($1,$2,$3,$4,0,'encrypted-test-candidate','digest-a',1,now()-CASE WHEN $11 THEN interval '301 seconds' ELSE (300-$12)*interval '1 second' END,now()+CASE WHEN $11 THEN interval '-1 second' ELSE $12*interval '1 second' END,$5,$6,$7,$8,$9,$10,'/profile')`, [flow, purpose, randomUUID(), browser, purpose === "bind" ? "pending_confirmation" : "pending_choice", purpose === "bind" ? user : null, purpose === "bind" ? 0 : null, purpose === "bind" ? new Date() : null, purpose === "bind", purpose === "bind" ? new Date() : null, expired, validForSeconds]);
  await runtime.query("UPDATE feline_auth_browser SET current_flow_id=$2 WHERE id=$1", [browser, flow]);
  return { browser, epoch: 0, flow, digest: "digest-a", revision: 1, fresh: true, enabled: true, user, identity: randomUUID(), session: randomUUID(), tokenHash: randomUUID(), encrypted: "encrypted-test-grant", keyId: "test", issuer: "http://localhost:18080/api/auth", sub: subject, sid: randomUUID(), exp: new Date(Date.now() + 60000).toISOString(), email: randomUUID() + "@center.test", username: "New cat" };
}
const bind = (value: unknown) => runtime.query("SELECT complete_legacy_binding($1)", [value]);

async function assertUnchanged(p: Awaited<ReturnType<typeof fixture>>) {
  expect((await admin.query('SELECT "authMode","authVersion",password FROM users WHERE id=$1', [p.user])).rows[0]).toEqual({ authMode: "legacy", authVersion: 0, password: "fixture-hash" });
  expect((await admin.query("SELECT count(*)::int n FROM feline_auth_identity WHERE user_id=$1", [p.user])).rows[0].n).toBe(0);
  expect((await admin.query("SELECT count(*)::int n FROM feline_auth_session WHERE user_id=$1", [p.user])).rows[0].n).toBe(0);
  expect((await admin.query("SELECT status,candidate_encrypted FROM feline_auth_flow WHERE id=$1", [p.flow])).rows[0]).toEqual({ status: "pending_confirmation", candidate_encrypted: "encrypted-test-candidate" });
  expect((await admin.query("SELECT epoch,current_flow_id FROM feline_auth_browser WHERE id=$1", [p.browser])).rows[0]).toEqual({ epoch: 0, current_flow_id: p.flow });
}

async function waitForLock(pid: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Expected the confirmation to wait for the fixture lock");
}
describe.skipIf(!enabled)("0003 real PostgreSQL transaction and ACL contract", () => {
  it("AC-19 shares anonymous CSRF initialization quotas across independent processes", async () => {
    // Keep both processes within one real database minute window.
    const remaining = 60000 - Date.now() % 60000;
    if (remaining < 20000) await new Promise(resolve => setTimeout(resolve, remaining + 50));
    const key = randomUUID();
    const before = (await admin.query("SELECT count(*)::int n FROM feline_auth_browser")).rows[0].n;
    const attempt = (count: number) => {
      const output = execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "src/test/auth-csrf-worker.ts", key, String(count)], {
        cwd: process.cwd(), windowsHide: true, encoding: "utf8", timeout: 30000,
        env: { ...process.env, POSTGRES_DATABASE_URL: runtimeUrl },
      }).trim().split("\n").at(-1)!;
      return JSON.parse(output);
    };
    expect(attempt(10)).toEqual(Array(10).fill(200));
    expect(attempt(11)).toEqual([...Array(10).fill(200), 429]);
    expect((await admin.query("SELECT count(*)::int n FROM feline_auth_browser")).rows[0].n - before).toBe(20);
  }, 90000);
  it("AC-19 shares rate budgets across independent application processes", () => {
    const key = randomUUID();
    const attempt = () => execFileSync(process.execPath, ["--import", "tsx", "src/test/auth-rate-worker.ts", key], {
      cwd: process.cwd(), windowsHide: true, encoding: "utf8", timeout: 15000,
      env: { ...process.env, POSTGRES_DATABASE_URL: runtimeUrl },
    }).trim();
    expect([attempt(), attempt(), attempt()]).toEqual(["accepted", "accepted", "limited"]);
  }, 60000);
  it("AC-18 refuses an absolutely expired flow without clearing the original password", async () => {
    const p = await fixture("bind", undefined, randomUUID(), true);
    await expect(bind(p)).rejects.toThrow("FLOW_EXPIRED");
    expect((await admin.query('SELECT "authMode",password FROM users WHERE id=$1', [p.user])).rows[0]).toEqual({ authMode: "legacy", password: "fixture-hash" });
  });
  it.each(["browser", "user"])("AC-18 rolls back a flow that expires while waiting for its %s lock", async target => {
    const p = await fixture("bind", undefined, randomUUID(), false, 1);
    const locker = await admin.connect(), completing = await runtime.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await locker.query("BEGIN");
      await locker.query(target === "browser" ? "SELECT id FROM feline_auth_browser WHERE id=$1 FOR UPDATE" : "SELECT id FROM users WHERE id=$1 FOR UPDATE", [target === "browser" ? p.browser : p.user]);
      const pid = (await completing.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = completing.query("SELECT complete_legacy_binding($1)", [p]).then(() => null, error => error);
      await waitForLock(pid);
      await admin.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM expires_at-clock_timestamp()))+0.05) FROM feline_auth_flow WHERE id=$1", [p.flow]);
      await locker.query("COMMIT");
      expect(await pending).toMatchObject({ message: "FLOW_EXPIRED" });
      await assertUnchanged(p);
    } finally {
      await locker.query("ROLLBACK"); await pending; locker.release(); completing.release();
    }
  });
  it("AC-18 rolls back every binding write when session uniqueness waits across expiry", async () => {
    const owner = await fixture(); await bind(owner);
    const p = await fixture("bind", undefined, randomUUID(), false, 1);
    const locker = await admin.connect(), completing = await runtime.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await locker.query("BEGIN");
      await locker.query("INSERT INTO feline_auth_session(id,token_hash,user_id,identity_id,auth_version,browser_state_id,browser_epoch,grant_encrypted,grant_key_id,center_session_id,center_token_expires_at,expires_at,revoked_at) VALUES($1,$2,$3,$4,1,$5,0,NULL,NULL,$6,now()+interval '1 minute',now()+interval '1 minute',now())", [p.session, randomUUID(), owner.user, owner.identity, owner.browser, randomUUID()]);
      const pid = (await completing.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = completing.query("SELECT complete_legacy_binding($1)", [p]).then(() => null, error => error);
      await waitForLock(pid);
      await admin.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM expires_at-clock_timestamp()))+0.05) FROM feline_auth_flow WHERE id=$1", [p.flow]);
      await locker.query("ROLLBACK");
      expect(await pending).toMatchObject({ message: "FLOW_EXPIRED" });
      await assertUnchanged(p);
    } finally {
      await locker.query("ROLLBACK"); await pending; locker.release(); completing.release();
    }
  });
  it("AC-9 AC-17 explicitly creates a center USER with no password", async () => {
    const p = await fixture("login"); p.user = randomUUID();
    await runtime.query("SELECT complete_new_profile($1)", [p]);
    expect((await admin.query('SELECT role,"authMode","authVersion",password FROM users WHERE id=$1', [p.user])).rows[0]).toEqual({ role: "USER", authMode: "center", authVersion: 1, password: null });
  });
  it("AC-21 keeps existing center login available when new binding and onboarding are closed", async () => {
    const p = await fixture(); await bind(p);
    const next = await fixture("login", p.user, p.sub); next.identity = p.identity; next.enabled = false;
    await runtime.query("SELECT complete_center_login($1)", [next]);
    expect((await admin.query("SELECT count(*)::int n FROM feline_auth_session WHERE user_id=$1 AND revoked_at IS NULL", [p.user])).rows[0].n).toBe(2);
  });
  it("AC-1 AC-7 AC-9 preserves original identity, ROOT, profile and business foreign keys", async () => {
    const p = await fixture();
    const before = (await admin.query("SELECT id,email,username,role FROM users WHERE id=$1", [p.user])).rows[0];
    const blog = (await admin.query(`INSERT INTO "Blog"("authorId",title,content,"updatedAt") VALUES($1,'fixture','fixture-content',now()) RETURNING id`, [p.user])).rows[0];
    await bind(p);
    const after = (await admin.query('SELECT id,email,username,role,password,"authMode","authVersion" FROM users WHERE id=$1', [p.user])).rows[0];
    expect(after).toMatchObject({ ...before, password: null, authMode: "center", authVersion: 1 });
    expect((await admin.query('SELECT "authorId" FROM "Blog" WHERE id=$1', [blog.id])).rows[0].authorId).toBe(p.user);
  });
  it("AC-17 makes simultaneous confirmation succeed at most once", async () => {
    const p = await fixture(); const results = await Promise.allSettled([bind(p), bind(p)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await admin.query("SELECT count(*)::int n FROM feline_auth_session WHERE user_id=$1", [p.user])).rows[0].n).toBe(1);
  });
  it("AC-6 serializes two identities claiming the same old user", async () => {
    const first = await fixture(), second = await fixture("bind", first.user);
    const results = await Promise.allSettled([bind(first), bind(second)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("AC-6 serializes two old users claiming the same center identity", async () => {
    const first = await fixture(), second = await fixture("bind", undefined, first.sub);
    const results = await Promise.allSettled([bind(first), bind(second)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("AC-7 rolls back password clearing and identity insertion when session insertion fails", async () => {
    const p = await fixture(); p.encrypted = null as unknown as string;
    await expect(bind(p)).rejects.toThrow();
    expect((await admin.query('SELECT password,"authMode","authVersion" FROM users WHERE id=$1', [p.user])).rows[0]).toEqual({ password: "fixture-hash", authMode: "legacy", authVersion: 0 });
    expect((await admin.query("SELECT count(*)::int n FROM feline_auth_identity WHERE user_id=$1", [p.user])).rows[0].n).toBe(0);
  });
  it("AC-14 rejects a callback or confirmation after logout advances the browser epoch", async () => {
    const p = await fixture(); await runtime.query("SELECT logout_browser($1,0)", [p.browser]);
    await expect(bind(p)).rejects.toThrow("FLOW_REPLACED");
    const b = (await runtime.query("SELECT epoch,require_fresh_auth FROM feline_auth_browser WHERE id=$1", [p.browser])).rows[0];
    expect(b).toEqual({ epoch: 1, require_fresh_auth: true });
  });
  it("AC-14 revokes the opposite ordering when login commits just before logout", async () => {
    const p = await fixture(); await bind(p); await runtime.query("SELECT logout_browser($1,0)", [p.browser]);
    const s = (await runtime.query("SELECT revoked_at,grant_encrypted FROM feline_auth_session WHERE id=$1", [p.session])).rows[0];
    expect(s.revoked_at).toBeInstanceOf(Date); expect(s.grant_encrypted).toBeNull();
  });
  it("AC-18 rejects an old page after another tab replaces the current flow", async () => {
    const p = await fixture(); await runtime.query("UPDATE feline_auth_browser SET current_flow_id=NULL WHERE id=$1", [p.browser]);
    await expect(bind(p)).rejects.toThrow("FLOW_REPLACED");
  });
  it("AC-4 AC-17 rechecks onboarding openness and rolls back an occupied email", async () => {
    const p = await fixture("login"); p.enabled = false;
    await expect(runtime.query("SELECT complete_new_profile($1)", [p])).rejects.toThrow("ONBOARDING_UNAVAILABLE");
    p.enabled = true; p.email = (await admin.query("SELECT email FROM users WHERE id=$1", [p.user])).rows[0].email;
    p.user = randomUUID();
    await expect(runtime.query("SELECT complete_new_profile($1)", [p])).rejects.toThrow();
    expect((await admin.query("SELECT count(*)::int n FROM users WHERE id=$1", [p.user])).rows[0].n).toBe(0);
  });
  it("AC-8 AC-21 prevents center users from being reverted, even by maintenance", async () => {
    const p = await fixture(); await bind(p);
    await expect(admin.query('UPDATE users SET "authMode"=\'legacy\',password=\'hash\',"authVersion"=0 WHERE id=$1', [p.user])).rejects.toThrow("AUTH_MODE_IRREVERSIBLE");
  });
  it.each([
    'INSERT INTO users(id,email,username,password,"updateAt") VALUES(\'forbidden\',\'forbidden@fixture.test\',\'bad\',\'hash\',now())',
    'DELETE FROM users', 'UPDATE users SET password=\'new-hash\'', 'UPDATE users SET "authVersion"=99',
    'DELETE FROM feline_auth_identity', 'UPDATE feline_auth_identity SET subject=\'other\'',
    'UPDATE feline_auth_session SET grant_encrypted=\'other\'', 'UPDATE feline_auth_browser SET epoch=99',
    "SELECT feline_auth_complete('{}'::jsonb,'new')", 'SET ROLE feline_auth_owner',
  ])("AC-22 rejects forbidden runtime mutation %s", async sql => { await expect(runtime.query(sql)).rejects.toThrow(); });
  it("AC-22 permits ordinary business profile writes under RLS", async () => {
    const p = await fixture(); await runtime.query("UPDATE users SET username='Permitted cat' WHERE id=$1", [p.user]);
    expect((await runtime.query("SELECT username FROM users WHERE id=$1", [p.user])).rows[0].username).toBe("Permitted cat");
  });
  it.each(["anon", "authenticated"])("AC-22 blocks %s from private tables, auth fields and commit functions", async role => {
    const db = await admin.connect();
    try {
      await db.query(`SET ROLE ${role}`);
      for (const sql of ["SELECT * FROM feline_auth_identity", "SELECT password FROM users", "SELECT complete_new_profile('{}'::jsonb)"]) await expect(db.query(sql)).rejects.toThrow();
    } finally { await db.query("RESET ROLE"); db.release(); }
  });
});
