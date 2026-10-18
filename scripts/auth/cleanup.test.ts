// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { config as loadEnv } from "dotenv";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".feline-blog/test.env", quiet: true });
const adminUrl = process.env.FELINE_AUTH_TEST_DATABASE_URL;
const runtimeUrl = process.env.FELINE_AUTH_TEST_RUNTIME_URL;
let pool: Pool, db: PoolClient;
beforeAll(() => {
  if (!adminUrl || !runtimeUrl) return;
  for (const value of [adminUrl, runtimeUrl]) {
    const url = new URL(value);
    if (url.hostname !== "127.0.0.1" || url.port !== "54341" || url.pathname !== "/feline_blog_dev") throw new Error("Only the dedicated isolated fixture is permitted");
  }
  pool = new Pool({ connectionString: adminUrl, max: 1 });
});
afterAll(async () => { await pool?.end(); });
describe.skipIf(!adminUrl || !runtimeUrl)("0003 real PostgreSQL cleanup retention", () => {
  beforeEach(async () => {
    db = await pool.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout='10s'");
    // These changes are rolled back, including all fixtures from other tests.
    await db.query("LOCK TABLE feline_auth_browser,feline_auth_flow,feline_auth_session,feline_auth_rate IN ACCESS EXCLUSIVE MODE");
    await db.query("DELETE FROM feline_auth_session; UPDATE feline_auth_browser SET current_flow_id=NULL; DELETE FROM feline_auth_flow; DELETE FROM feline_auth_browser; DELETE FROM feline_auth_rate");
  });
  afterEach(async () => { if (db) { await db.query("ROLLBACK"); db.release(); } });
  const clean = async () => {
    // AC-C1 moves deletion away from the application. The compatible wrapper is maintenance only.
    await db.query("SET LOCAL ROLE feline_auth_owner");
    const result = (await db.query("SELECT cleanup_auth_rows(100) AS result")).rows[0].result;
    await db.query("RESET ROLE");
    return result;
  };
  it("AC-C4 denies the application the maintenance cleanup entry",async()=>{
    const role=decodeURIComponent(new URL(runtimeUrl!).username);
    if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw Error("Invalid fixture role");
    await db.query("SAVEPOINT cleanup_acl");
    await db.query('SET LOCAL ROLE "'+role+'"');
    await expect(db.query("SELECT cleanup_auth_rows(100)")).rejects.toMatchObject({code:"42501"});
    await db.query("ROLLBACK TO SAVEPOINT cleanup_acl");await db.query("RELEASE SAVEPOINT cleanup_acl");
  });
  it("counts expired rate buckets and reports backlog beyond one batch", async () => {
    await db.query("INSERT INTO feline_auth_rate SELECT 'cleanup-'||n,'entry',now()-interval '2 days',1,now()-interval '1 day' FROM generate_series(1,2501) n");
    let total = 0, calls = 0, result;
    do {
      result = await clean(); calls++;
      expect(result).toMatchObject({ flows: 0, sessions: 0, browsers: 0 });
      expect(result.rates).toBeLessThanOrEqual(100);
      total += result.rates;
    } while (result.pending && calls < 30);
    expect({ total, calls, pending: result.pending }).toEqual({ total: 2501, calls: 26, pending: false });
    expect((await db.query("SELECT count(*)::int n FROM feline_auth_rate")).rows[0].n).toBe(0);
  });
  it("counts and drains browser-only backlog", async () => {
    await db.query("INSERT INTO feline_auth_browser(id,browser_token_hash,expires_at) SELECT gen_random_uuid(),'cleanup-browser-'||n,now()-interval '1 day' FROM generate_series(1,205) n");
    let total = 0, result;
    do { result = await clean(); total += result.browsers; } while (result.pending && total < 300);
    expect({ total, pending: result.pending }).toEqual({ total: 205, pending: false });
    expect((await db.query("SELECT count(*)::int n FROM feline_auth_browser")).rows[0].n).toBe(0);
  });
  it("drains multiple browsers while preserving active flow pointers and sessions", async () => {
    const user = randomUUID(), identity = randomUUID();
    await db.query(`INSERT INTO users(id,email,username,password,"authMode","authVersion","updateAt") VALUES($1,$2,'Cleanup cat',NULL,'center',1,now())`, [user, user+'@fixture.test']);
    await db.query("INSERT INTO feline_auth_identity(id,issuer,subject,user_id,verified_email,email_verified_at,created_from) VALUES($1,'https://fixture.test','cleanup',$2,$3,now(),'new_profile')", [identity,user,user+'@fixture.test']);
    await db.query("INSERT INTO feline_auth_browser(id,browser_token_hash,expires_at) SELECT gen_random_uuid(),'cleanup-mixed-'||n,now()-interval '1 day' FROM generate_series(1,205) n");
    await db.query("INSERT INTO feline_auth_flow(id,purpose,state_hash,browser_state_id,browser_epoch,created_at,expires_at,destination) SELECT gen_random_uuid(),'login',id::text,id,0,now()-interval '2 days',now()-interval '2 days'+interval '300 seconds','/' FROM feline_auth_browser");
    await db.query("UPDATE feline_auth_browser b SET current_flow_id=f.id FROM feline_auth_flow f WHERE f.browser_state_id=b.id");
    await db.query("INSERT INTO feline_auth_session(id,token_hash,user_id,identity_id,auth_version,browser_state_id,browser_epoch,center_session_id,center_token_expires_at,expires_at,revoked_at) SELECT gen_random_uuid(),id::text,$1,$2,1,id,0,'cleanup',now()-interval '1 day',now()-interval '1 day',now() FROM feline_auth_browser", [user,identity]);
    const active = randomUUID(), flow = randomUUID(), session = randomUUID();
    // An expired browser with a valid reference must not starve other browsers.
    await db.query("INSERT INTO feline_auth_browser(id,browser_token_hash,expires_at) VALUES($1::uuid,$1::text,now()-interval '1 second')", [active]);
    await db.query("INSERT INTO feline_auth_flow(id,purpose,state_hash,browser_state_id,browser_epoch,expires_at,destination) VALUES($1::uuid,'login',$1::text,$2,0,now()+interval '300 seconds','/')", [flow,active]);
    await db.query("UPDATE feline_auth_browser SET current_flow_id=$2 WHERE id=$1", [active,flow]);
    await db.query("INSERT INTO feline_auth_session(id,token_hash,user_id,identity_id,auth_version,browser_state_id,browser_epoch,grant_encrypted,grant_key_id,center_session_id,center_token_expires_at,expires_at) VALUES($1::uuid,$1::text,$2,$3,1,$4,0,'keep-secret','fixture','active',now()+interval '1 hour',now()+interval '1 hour')", [session,user,identity,active]);
    const totals = { flows: 0, sessions: 0, browsers: 0 };
    let result, calls = 0;
    do { result = await clean(); calls++; for (const key of ["flows","sessions","browsers"] as const) totals[key] += result[key]; } while (result.pending && calls < 10);
    expect(totals).toEqual({ flows:205, sessions:205, browsers:205 });
    expect(result.pending).toBe(false);
    expect((await db.query("SELECT id,current_flow_id FROM feline_auth_browser")).rows).toEqual([{ id:active,current_flow_id:flow }]);
    expect((await db.query("SELECT id,grant_encrypted FROM feline_auth_session")).rows).toEqual([{ id:session,grant_encrypted:'keep-secret' }]);
  });
});
