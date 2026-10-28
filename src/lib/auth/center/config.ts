export class AuthError extends Error {
  constructor(
    public code: string,
    public status = 401,
    public retryAfter?: number
  ) {
    super(code);
  }
}

export function centerConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const production = env.NODE_ENV === "production";
  const staging = env.APP_ENV === "staging";
  const origin = env.FELINE_PUBLIC_ORIGIN ?? "http://localhost:3000";
  const issuer = env.USER_CENTER_ISSUER ?? "http://localhost:8080/api/auth";
  for (const value of [origin, issuer]) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          !production &&
          !staging &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
          url.protocol === "http:"
        ))
    )
      throw new AuthError("CONFIGURATION_INVALID", 503);
  }
  if (
    new URL(origin).origin !== origin ||
    !issuer.endsWith("/api/auth") ||
    ((production || staging) &&
      ((!staging && origin !== "https://blog.zhaosie.com") ||
        issuer !== "https://auth.zhaosie.com/api/auth"))
  )
    throw new AuthError("CONFIGURATION_INVALID", 503);
  const secret = Buffer.from(env.FELINE_SESSION_SECRET ?? "", "base64");
  if (secret.length < 32) throw new AuthError("CONFIGURATION_INVALID", 503);
  let keyring: { active: string; keys: Record<string, string> };
  try {
    keyring = JSON.parse(env.FELINE_GRANT_KEYRING ?? "");
    const validId = (id: unknown) =>
      typeof id === "string" &&
      /^[A-Za-z0-9_-]{1,64}$/.test(id) &&
      !["__proto__", "constructor", "prototype"].includes(id);
    if (
      !keyring.keys ||
      Array.isArray(keyring.keys) ||
      !validId(keyring.active) ||
      !Object.hasOwn(keyring.keys, keyring.active) ||
      Object.entries(keyring.keys).some(
        ([id, value]) =>
          !validId(id) || typeof value !== "string" || Buffer.from(value, "base64").length !== 32
      )
    )
      throw new Error();
  } catch {
    throw new AuthError("CONFIGURATION_INVALID", 503);
  }
  const clientSecret = env.USER_CENTER_CLIENT_SECRET;
  if (
    (env.USER_CENTER_CLIENT_ID && env.USER_CENTER_CLIENT_ID !== "feline-blog") ||
    !clientSecret ||
    Buffer.byteLength(clientSecret) < 32 ||
    clientSecret === env.FELINE_SESSION_SECRET ||
    Object.values(keyring.keys).some(
      (value) => value === clientSecret || Buffer.from(value, "base64").equals(secret)
    )
  )
    throw new AuthError("CONFIGURATION_INVALID", 503);
  // Admission belongs to the issuer. Local registration is never configurable.
  return {
    origin,
    issuer,
    clientId: "feline-blog",
    clientSecret,
    callback: origin + "/api/auth/callback/user-center",
    secret,
    keyring,
    production,
    registration: "closed" as const,
    cookiePrefix: production ? "__Host-feline-" : `feline-${new URL(origin).port || "dev"}-`,
    scope: "openid email profile",
  };
}
export function destination(name: unknown) {
  const destinations = { home: "/", profile: "/profile", dashboard: "/dashboard" };
  return typeof name === "string" && Object.hasOwn(destinations, name)
    ? destinations[name as keyof typeof destinations]
    : undefined;
}
export function publicAuthRoutes() {
  const config = centerConfig();
  return { centerOrigin: new URL(config.issuer).origin, blogOrigin: config.origin };
}
