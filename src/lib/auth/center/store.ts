import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { postgresPool } from "@/db/postgres/runtime";
import { AuthError } from "./config";
import { digest, privateKey, randomToken } from "./crypto";

export type BrowserState = { id: string; epoch: number; current_flow_id: string | null; require_fresh_auth: boolean; last_logout_at: Date | null; expires_at: Date };
export type Flow = { id: string; purpose: "login" | "bind"; browser_state_id: string; browser_epoch: number; state_hash: string; protocol_encrypted: string | null; candidate_encrypted: string | null; candidate_digest: string | null; confirmation_revision: number; status: string; created_at: Date; expires_at: Date; legacy_user_id: string | null; legacy_auth_version: number | null; legacy_verified_at: Date | null; require_fresh_auth: boolean; reauth_after: Date | null; destination: string };
export type CookieReader = (name: string) => string | undefined;
export function cookieNames() {
  const production = process.env.NODE_ENV === "production";
  const prefix = production ? "__Host-feline-" : `feline-${new URL(process.env.FELINE_PUBLIC_ORIGIN ?? "http://localhost:3000").port || "dev"}-`;
  return { browser: prefix + "browser", session: prefix + "session", flow: prefix + "flow", csrf: prefix + "csrf", fresh: prefix + "reauth" };
}
export function dbError(error: unknown): never {
  if (error instanceof AuthError) throw error;
  const e = error as { code?: string; message?: string; constraint?: string };
  if (e.code === "23505") throw new AuthError(e.constraint?.includes("email") ? "EMAIL_UNAVAILABLE" : "IDENTITY_ALREADY_LINKED", 409);
  if (e.code === "P0001" && /^[A-Z_]+$/.test(e.message ?? "")) throw new AuthError(e.message!, 409);
  throw new AuthError("DATABASE_UNAVAILABLE", 503);
}
export async function query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  try { return (await postgresPool.query<T>(sql, values)).rows; } catch (error) { return dbError(error); }
}
export async function transaction<T>(run: (db: PoolClient) => Promise<T>) {
  const db = await postgresPool.connect().catch(dbError);
  try { await db.query("BEGIN"); await db.query("SET LOCAL lock_timeout='3s'"); const result = await run(db); await db.query("COMMIT"); return result; }
  catch (error) { await db.query("ROLLBACK").catch(() => {}); return dbError(error); }
  finally { db.release(); }
}
export async function browserState(read: CookieReader, create = false): Promise<{ browser: BrowserState; token?: string }> {
  const token = read(cookieNames().browser);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const [browser] = await query<BrowserState>("SELECT * FROM public.feline_auth_browser WHERE browser_token_hash=$1 AND expires_at>clock_timestamp()", [digest(token)]);
    if (browser) return { browser };
  }
  if (!create) throw new AuthError("BROWSER_REQUIRED");
  const nextToken = randomToken();
  const [browser] = await query<BrowserState>("INSERT INTO public.feline_auth_browser(id,browser_token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '7 days') RETURNING *", [randomUUID(), digest(nextToken)]);
  return { browser, token: nextToken };
}
export async function lockFlow(db: PoolClient, browser: BrowserState, id: string, states?: string[]) {
  const { rows: [current] } = await db.query<BrowserState>("SELECT * FROM public.feline_auth_browser WHERE id=$1 FOR UPDATE", [browser.id]);
  if (!current || current.epoch !== browser.epoch || current.current_flow_id !== id || current.expires_at.getTime() <= Date.now()) throw new AuthError("FLOW_REPLACED", 409);
  const { rows: [flow] } = await db.query<Flow>("SELECT * FROM public.feline_auth_flow WHERE id=$1 FOR UPDATE", [id]);
  assertFlow(current, flow, states);
  return flow;
}
export function assertFlow(browser: BrowserState, flow: Flow | undefined, states?: string[]): asserts flow is Flow {
  if (!flow || browser.current_flow_id !== flow.id || flow.browser_state_id !== browser.id || browser.epoch !== flow.browser_epoch) throw new AuthError("FLOW_REPLACED", 409);
  if (flow.expires_at.getTime() <= Date.now()) throw new AuthError("FLOW_EXPIRED", 409);
  if (states && !states.includes(flow.status)) throw new AuthError("FLOW_PROCESSED", 409);
}
export async function currentFlow(read: CookieReader, states?: string[]) {
  const { browser } = await browserState(read);
  const id = read(cookieNames().flow);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new AuthError("FLOW_REQUIRED", 409);
  const [flow] = await query<Flow>("SELECT * FROM public.feline_auth_flow WHERE id=$1", [id]);
  assertFlow(browser, flow, states);
  return { browser, flow };
}
export async function rateLimit(operation: string, key: string, seconds: number, max: number) {
  const [result] = await query<{ count: number; retry: number }>(`INSERT INTO public.feline_auth_rate(key_hash,operation,window_start,count,expires_at)
    VALUES($1,$2,to_timestamp(floor(extract(epoch FROM clock_timestamp())/$3)*$3),1,to_timestamp((floor(extract(epoch FROM clock_timestamp())/$3)+1)*$3))
    ON CONFLICT(key_hash,operation,window_start) DO UPDATE SET count=LEAST(feline_auth_rate.count+1,$4+1)
    RETURNING count, GREATEST(1,ceil(extract(epoch FROM expires_at-clock_timestamp())))::integer AS retry`, [privateKey("rate", key), operation, seconds, max]);
  if (result.count > max) throw new AuthError("RATE_LIMITED", 429, result.retry);
}
