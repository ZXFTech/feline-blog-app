import fs from "node:fs/promises";
import path from "node:path";
import { onlineTarget as target, onlineDirectory } from "./online-target";

async function publicJson(url: string) {
  const response = await fetch(url, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(5000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw Error("CENTER_UNAVAILABLE");
  const reader = response.body?.getReader();
  if (!reader) throw Error("UNTRUSTED_METADATA");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1048576) throw Error("UNTRUSTED_METADATA");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    ) as Record<string, unknown>;
  } catch {
    throw Error("UNTRUSTED_METADATA");
  }
}
// Public endpoints only. No Client, Cookie, secret, platform DB or center DB access.
export async function checkOnlineMetadata() {
  let result: Record<string, unknown>;
  let declaredEnvironment = "not-read";
  try {
    const discovery = await publicJson(target.issuer + "/.well-known/openid-configuration");
    if (discovery.issuer !== target.issuer) throw Error("UNTRUSTED_METADATA");
    declaredEnvironment =
      discovery.user_center_environment === undefined
        ? "missing"
        : typeof discovery.user_center_environment === "string" &&
            ["development", "staging", "production"].includes(discovery.user_center_environment)
          ? discovery.user_center_environment
          : "unrecognized";
    if (discovery.user_center_environment !== "production") throw Error("ENVIRONMENT_MISMATCH");
    for (const [field, pathname] of [
      ["authorization_endpoint", "/api/auth/oauth2/authorize"],
      ["token_endpoint", "/api/auth/oauth2/token"],
      ["jwks_uri", "/api/auth/jwks"],
    ]) {
      if (discovery[field] !== new URL(pathname, target.issuer).toString())
        throw Error("UNTRUSTED_METADATA");
    }
    const jwks = await publicJson(target.issuer + "/jwks");
    if (
      !Array.isArray(jwks.keys) ||
      !jwks.keys.length ||
      jwks.keys.some(
        (key) =>
          !key ||
          typeof key !== "object" ||
          Array.isArray(key) ||
          typeof key.kid !== "string" ||
          !["RSA", "EC", "OKP"].includes(key.kty) ||
          ["d", "p", "q", "k", "dp", "dq", "qi", "oth"].some((field) => field in key)
      )
    )
      throw Error("UNTRUSTED_METADATA");
    result = {
      checkedAt: new Date().toISOString(),
      status: "PASS",
      issuer: target.issuer,
      environment: "production",
      jwksKeys: jwks.keys.length,
      strictTls: true,
      publicGetOnly: true,
    };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "CENTER_UNAVAILABLE";
    result = {
      checkedAt: new Date().toISOString(),
      status: "BLOCKED",
      code,
      declaredEnvironment,
      issuer: target.issuer,
      strictTls: true,
      publicGetOnly: true,
    };
  }
  await fs.writeFile(
    path.join(onlineDirectory(), "metadata-check.json"),
    JSON.stringify(result, null, 2) + "\n"
  );
  return result;
}
