import { checkUser } from "@/db/userAction";
import { verifyToken } from "@/lib/jwt";
import { AuthError, centerConfig } from "./config";
import { digest, sessionAAD, unseal } from "./crypto";
import { introspect } from "./protocol";
import { cookieNames, query, type CookieReader } from "./store";

export async function legacyIdentity(read: CookieReader) {
  const token = read("token");
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims || !Number.isSafeInteger(claims.authVersion ?? 0)) return null;
  const user = await checkUser("id", claims.userId);
  return user && user.authMode === "legacy" && user.authVersion === (claims.authVersion ?? 0) ? user : null;
}
type StoredSession = { id: string; identity_id: string; user_id: string; auth_version: number; grant_encrypted: string; subject: string; center_session_id: string; center_token_expires_at: Date; verified_email: string; email_verified_at: Date };
export async function resolveIdentity(read: CookieReader) {
  const names = cookieNames();
  const token = read(names.session);
  if (!token) return legacyIdentity(read);
  const browser = read(names.browser);
  if (!browser || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [session] = await query<StoredSession>(`SELECT s.*,i.subject,i.verified_email,i.email_verified_at FROM public.feline_auth_session s
    JOIN public.feline_auth_identity i ON i.id=s.identity_id AND i.user_id=s.user_id
    JOIN public.feline_auth_browser b ON b.id=s.browser_state_id
    JOIN public.users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND b.browser_token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND i.issuer=$3 AND b.expires_at>clock_timestamp() AND b.epoch=s.browser_epoch AND u."authMode"='center' AND u.password IS NULL AND u."authVersion"=s.auth_version`, [digest(token), digest(browser), centerConfig().issuer]);
  if (!session) return null;
  try {
    const grant = unseal<string>(session.grant_encrypted, sessionAAD(session.id, session.identity_id));
    await introspect(grant, { sub: session.subject, sid: session.center_session_id, exp: Math.floor(session.center_token_expires_at.getTime() / 1000) });
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) { await query("SELECT public.revoke_local_session($1)", [session.id]); return null; }
    throw error;
  }
  const user = await checkUser("id", session.user_id);
  if (!user || user.authMode !== "center" || user.authVersion !== session.auth_version) return null;
  return { ...user, centerEmail: session.verified_email, centerEmailVerifiedAt: session.email_verified_at.toISOString() };
}
