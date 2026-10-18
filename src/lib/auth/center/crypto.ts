import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthError, centerConfig } from "./config";

export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const mac = (purpose: string, value: string) => createHmac("sha256", centerConfig().secret).update(JSON.stringify(["feline-v1", purpose, value])).digest("base64url");
export const privateKey = (purpose: string, value: string) => mac(purpose, value);
export function sign(purpose: string, value: unknown) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return payload + "." + mac(purpose, payload);
}
export function verify<T>(purpose: string, signed: unknown): T {
  if (typeof signed !== "string" || signed.length > 4096) throw new AuthError("INVALID_PROOF", 403);
  const [payload, signature, extra] = signed.split(".");
  const actual = Buffer.from(signature ?? "");
  const expected = Buffer.from(mac(purpose, payload));
  if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AuthError("INVALID_PROOF", 403);
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T; }
  catch { throw new AuthError("INVALID_PROOF", 403); }
}
export function seal(value: unknown, aad: string) {
  const { active, keys } = centerConfig().keyring;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keys[active], "base64"), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [active, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function unseal<T>(value: string, aad: string): T {
  try {
    const [id, iv, tag, encrypted, extra] = value.split(".");
    const key = centerConfig().keyring.keys[id];
    if (!key || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as T;
  } catch { throw new AuthError("CREDENTIAL_UNAVAILABLE", 503); }
}
export const sessionAAD = (id: string, identityId: string) => JSON.stringify(["session", 1, id, identityId, centerConfig().issuer, centerConfig().clientId]);
export const flowAAD = (id: string, purpose: "protocol" | "candidate") => JSON.stringify(["flow", 1, id, purpose]);
