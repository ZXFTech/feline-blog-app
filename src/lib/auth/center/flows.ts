import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import bcrypt from "bcryptjs";
import { validateEmail } from "@/utils/auth";
import { parseString } from "@/lib/server/validation";
import { AuthError, centerConfig } from "./config";
import { digest, flowAAD, randomToken, seal, sessionAAD, sign, unseal, verify } from "./crypto";
import { authorization, exchange, freshAuth, introspect, type Candidate, type ProtocolState } from "./protocol";
import { assertFlow, browserState, cookieNames, currentFlow, lockFlow, query, rateLimit, transaction, type BrowserState, type CookieReader, type Flow } from "./store";
import { resolveIdentity } from "./session";
import { checkUser } from "@/db/userAction";

type Proof = { action: string; flow: string; browser: string; epoch: number; revision: number; digest: string | null; user: string | null; version: number | null; expires: number };
const proofValues = (action: string, b: BrowserState, f: Flow): Proof => ({ action, flow: f.id, browser: b.id, epoch: f.browser_epoch, revision: f.confirmation_revision, digest: f.candidate_digest, user: f.legacy_user_id, version: f.legacy_auth_version, expires: f.expires_at.getTime() });
export const flowProof = (action: string, b: BrowserState, f: Flow) => sign("flowProof", proofValues(action, b, f));
export function verifyFlowProof(input: unknown, action: string, browser: BrowserState, flow: Flow) {
  const proof = verify<Proof>("flowProof", input);
  if (proof.expires <= Date.now() || JSON.stringify(proof) !== JSON.stringify(proofValues(action, browser, flow))) throw new AuthError("FLOW_REPLACED", 409);
}
export function csrfToken(browser: BrowserState, nonce: string) {
  return sign("csrf", { origin: centerConfig().origin, browser: browser.id, epoch: browser.epoch, nonce, expires: Date.now() + 1800000 });
}
export async function verifyCsrf(read: CookieReader, token: unknown) {
  const { browser } = await browserState(read);
  const proof = verify<{ origin: string; browser: string; epoch: number; nonce: string; expires: number }>("csrf", token);
  if (proof.origin !== centerConfig().origin || proof.browser !== browser.id || proof.epoch !== browser.epoch || proof.nonce !== read(cookieNames().csrf) || proof.expires <= Date.now()) throw new AuthError("CSRF_REJECTED", 403);
  return browser;
}
// An absent trusted proxy deliberately shares a bounded bucket, never trusts XFF.
export const trustedIp = (headers: Headers) => {
  const value=headers.get("x-real-ip");
  return (process.env.VERCEL==="1" || process.env.FELINE_TRUSTED_PROXY==="true") && value && isIP(value) ? value : "no-trusted-ip";
};
export async function passwordProof(email: string, password: string, headers: Headers) {
  await rateLimit("password-ip", trustedIp(headers), 60, 10);
  await rateLimit("password-account", email.toLowerCase(), 900, 5);
  const user = await checkUser("email", email.toLowerCase(), true);
  // Fixed cost matches existing bcrypt cost 10; unknown and migrated users compare too.
  const fake = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const eligible = user?.authMode === "legacy" && !!user.password;
  const valid = await bcrypt.compare(password, eligible ? user.password! : fake);
  if (!eligible || !valid) throw new AuthError("INVALID_CREDENTIALS");
  return user;
}
export async function startFlow(read: CookieReader, browser: BrowserState, purpose: "login" | "bind", to: string, legacy?: { id: string; authVersion: number }) {
  const config = centerConfig();
  if (!(purpose === "bind" ? config.binding : config.login)) throw new AuthError("ENTRY_UNAVAILABLE", 503);
  const protocol: ProtocolState = { state: randomToken(), nonce: randomToken(), verifier: randomToken() };
  const id = randomUUID();
  const { flow, fresh } = await transaction(async db => {
    const { rows: [b] } = await db.query<BrowserState>("SELECT * FROM public.feline_auth_browser WHERE id=$1 FOR UPDATE", [browser.id]);
    if (!b || b.epoch !== browser.epoch || b.expires_at.getTime() <= Date.now()) throw new AuthError("FLOW_REPLACED", 409);
    await db.query("UPDATE public.feline_auth_flow SET status='replaced',protocol_encrypted=NULL,candidate_encrypted=NULL WHERE id=$1 AND status IN ('created','exchanging','pending_choice','pending_confirmation')", [b.current_flow_id]);
    const fresh = purpose === "bind" || b.require_fresh_auth;
    const { rows: [flow] } = await db.query<Flow>(`INSERT INTO public.feline_auth_flow(id,purpose,state_hash,browser_state_id,browser_epoch,protocol_encrypted,created_at,expires_at,legacy_user_id,legacy_auth_version,legacy_verified_at,require_fresh_auth,reauth_after,destination)
      VALUES($1,$2,$3,$4,$5,$6,statement_timestamp(),statement_timestamp()+interval '300 seconds',$7,$8,CASE WHEN $2='bind' THEN statement_timestamp() END,$9,CASE WHEN $9 THEN GREATEST(statement_timestamp(),$10::timestamptz) END,$11) RETURNING *`, [id, purpose, digest(protocol.state), b.id, b.epoch, seal(protocol, flowAAD(id, "protocol")), legacy?.id ?? null, legacy?.authVersion ?? null, fresh, b.last_logout_at, to]);
    await db.query("UPDATE public.feline_auth_browser SET current_flow_id=$2,expires_at=clock_timestamp()+interval '7 days',updated_at=clock_timestamp() WHERE id=$1", [b.id, id]);
    return { flow, fresh };
  });
  void read;
  try { return { flow, url: await authorization(protocol, fresh) }; }
  catch (error) {
    await terminalFlow(read, flow.id, "failed").catch(() => {});
    throw error;
  }
}
export async function terminalFlow(read: CookieReader, id: string, status: "cancelled" | "failed") {
  const { browser } = await browserState(read);
  await transaction(async db => {
    await lockFlow(db, browser, id, ["created", "exchanging", "pending_choice", "pending_confirmation"]);
    await db.query("UPDATE public.feline_auth_flow SET status=$2,protocol_encrypted=NULL,candidate_encrypted=NULL WHERE id=$1", [id, status]);
    await db.query("UPDATE public.feline_auth_browser SET current_flow_id=NULL,updated_at=clock_timestamp() WHERE id=$1 AND current_flow_id=$2", [browser.id, id]);
  });
}
export async function pendingPage(read: CookieReader, status: "pending_choice" | "pending_confirmation") {
  const { browser, flow } = await currentFlow(read, [status]);
  const candidate = unseal<Candidate>(flow.candidate_encrypted!, flowAAD(flow.id, "candidate"));
  const user = status === "pending_confirmation" ? await resolveIdentity(read) : null;
  if (status === "pending_confirmation" && (!user || user.id !== flow.legacy_user_id || user.authVersion !== flow.legacy_auth_version)) throw new AuthError("LEGACY_PROOF_REQUIRED");
  return { email: candidate.email, username: candidate.name, legacy: user ? { email: user.email, username: user.username } : null, expiresAt: flow.expires_at.toISOString(), proof: flowProof(status === "pending_choice" ? "onboarding" : "bind", browser, flow), cancelProof: flowProof("cancel", browser, flow) };
}
export async function callback(read: CookieReader, url: URL) {
  const { browser, flow } = await currentFlow(read, ["created"]);
  const states = url.searchParams.getAll("state");
  if (states.length !== 1 || digest(states[0]) !== flow.state_hash) throw new AuthError("INVALID_STATE");
  await transaction(async db => {
    await lockFlow(db, browser, flow.id, ["created"]);
    await db.query("UPDATE public.feline_auth_flow SET status='exchanging' WHERE id=$1", [flow.id]);
  });
  try {
    const protocol = unseal<ProtocolState>(flow.protocol_encrypted!, flowAAD(flow.id, "protocol"));
    const candidate = await exchange(url, protocol, flow.reauth_after);
    const candidateDigest = digest(JSON.stringify([candidate.issuer, candidate.sub, candidate.email, true]));
    const next = await transaction(async db => {
      await lockFlow(db, browser, flow.id, ["exchanging"]);
      const { rows: [stored] } = await db.query<Flow>("UPDATE public.feline_auth_flow SET status=$2,candidate_encrypted=$3,candidate_digest=$4,confirmation_revision=1,protocol_encrypted=NULL WHERE id=$1 RETURNING *", [flow.id, flow.purpose === "bind" ? "pending_confirmation" : "pending_choice", seal(candidate, flowAAD(flow.id, "candidate")), candidateDigest]);
      return stored;
    });
    if (flow.purpose === "bind") return { location: "/auth/user-center/confirm" };
    const [identity] = await query<{ id: string; user_id: string }>("SELECT id,user_id FROM public.feline_auth_identity WHERE issuer=$1 AND subject=$2", [candidate.issuer, candidate.sub]);
    if (identity) return commit(read, browser, next, candidate, "login", identity);
    return { location: "/auth/user-center/onboarding" };
  } catch (error) {
    await terminalFlow(read, flow.id, "failed").catch(() => {});
    throw error;
  }
}
async function commit(read: CookieReader, browser: BrowserState, flow: Flow, candidate: Candidate, kind: "bind" | "new" | "login", identity?: { id: string; user_id: string }, username?: string) {
  // A fresh network check occurs immediately before every final transaction.
  await introspect(candidate.grant, candidate);
  assertFlow(browser, flow, [kind === "bind" ? "pending_confirmation" : "pending_choice"]);
  const config = centerConfig();
  const fresh = !flow.require_fresh_auth || (flow.reauth_after !== null && freshAuth(candidate.authTime, candidate.iat, flow.reauth_after));
  if (!fresh) throw new AuthError("FRESH_AUTH_REQUIRED");
  if (kind === "bind") {
    const legacy = await resolveIdentity(read);
    if (!legacy || legacy.authMode !== "legacy" || legacy.id !== flow.legacy_user_id || legacy.authVersion !== flow.legacy_auth_version) throw new AuthError("LEGACY_PROOF_REQUIRED");
  }
  if (kind === "new" && (!validateEmail(candidate.email) || candidate.email.length > 254)) throw new AuthError("INVALID_EMAIL", 400);
  const name = kind === "new" ? parseString(username ?? candidate.name, { label: "昵称", max: 50 }) : undefined;
  if (kind === "new" && !name) throw new AuthError("USERNAME_REQUIRED", 400);
  const id = randomUUID(), identityId = identity?.id ?? randomUUID(), token = randomToken();
  const encrypted = seal(candidate.grant, sessionAAD(id, identityId));
  const fn = { bind: "complete_legacy_binding", new: "complete_new_profile", login: "complete_center_login" }[kind];
  await query(`SELECT public.${fn}($1::jsonb)`, [JSON.stringify({ browser: browser.id, epoch: browser.epoch, flow: flow.id, digest: flow.candidate_digest, revision: flow.confirmation_revision, fresh, enabled: kind === "bind" ? config.binding : config.onboarding, session: id, identity: identityId, user: identity?.user_id ?? flow.legacy_user_id ?? randomUUID(), issuer: candidate.issuer, sub: candidate.sub, email: candidate.email, username: name, tokenHash: digest(token), encrypted, keyId: config.keyring.active, sid: candidate.sid, exp: new Date(candidate.exp * 1000).toISOString() })]);
  return { location: flow.destination, token, expires: new Date(Math.min(Date.now() + 604800000, candidate.exp * 1000)) };
}
export async function submitFlow(read: CookieReader, proof: unknown, action: "bind" | "onboarding" | "cancel", choice?: unknown, username?: unknown, confirm?: unknown) {
  const { browser, flow } = await currentFlow(read, action === "cancel" ? ["created", "exchanging", "pending_choice", "pending_confirmation"] : [action === "bind" ? "pending_confirmation" : "pending_choice"]);
  verifyFlowProof(proof, action, browser, flow);
  if (action === "cancel" || (action === "onboarding" && choice === "legacy")) {
    await transaction(async db => {
      const locked = await lockFlow(db, browser, flow.id);
      verifyFlowProof(proof, action, browser, locked);
      await db.query("UPDATE public.feline_auth_flow SET status='cancelled',protocol_encrypted=NULL,candidate_encrypted=NULL WHERE id=$1", [flow.id]);
      await db.query("UPDATE public.feline_auth_browser SET current_flow_id=NULL WHERE id=$1", [browser.id]);
    });
    return { location: action === "cancel" ? "/login" : "/login?legacy=1" };
  }
  if (confirm !== true && confirm !== "true") throw new AuthError("CONFIRMATION_REQUIRED", 400);
  if (action === "onboarding" && choice !== "create") throw new AuthError("INVALID_INPUT", 400);
  if (username !== undefined && typeof username !== "string") throw new AuthError("INVALID_INPUT", 400);
  const candidate = unseal<Candidate>(flow.candidate_encrypted!, flowAAD(flow.id, "candidate"));
  // The function rechecks this proof's digest, revision, pointer and epoch under lock.
  return commit(read, browser, flow, candidate, action === "bind" ? "bind" : "new", undefined, username as string | undefined);
}
