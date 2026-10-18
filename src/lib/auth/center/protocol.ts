import * as oidc from "openid-client";
import { AuthError, centerConfig } from "./config";
import { nativeFetch } from "./transport";

export type ProtocolState = { state: string; nonce: string; verifier: string };
export type Candidate = { issuer: string; sub: string; email: string; name: string; grant: string; sid: string; exp: number; authTime?: number; iat: number };
export function freshAuth(authTime: unknown, iat: number, after: Date, now = Date.now()) {
  const a = Number(authTime), n = Math.floor(now / 1000), f = Math.floor(after.getTime() / 1000);
  return typeof authTime === "number" && Number.isSafeInteger(a) && a > 0 && a >= f - 30 && a <= n + 30 && a <= iat + 30 && n - a <= 330;
}
async function configuration() {
  const config = centerConfig();
  const options: oidc.DiscoveryRequestOptions = { algorithm: "oauth2", timeout: 3, execute: [oidc.enableNonRepudiationChecks], [oidc.customFetch]: nativeFetch };
  if (!config.production && config.issuer.startsWith("http:")) options.execute!.push(oidc.allowInsecureRequests);
  const client = await oidc.discovery(new URL(config.issuer), config.clientId, { client_secret: config.clientSecret, [oidc.clockTolerance]: 30 }, oidc.ClientSecretBasic(config.clientSecret), options);
  const metadata = client.serverMetadata();
  if (metadata.issuer !== config.issuer) throw new AuthError("INVALID_ISSUER");
  const expected = { authorization_endpoint: config.issuer + "/oauth2/authorize", token_endpoint: config.issuer + "/oauth2/token", userinfo_endpoint: config.issuer + "/oauth2/userinfo", introspection_endpoint: config.issuer + "/oauth2/introspect", jwks_uri: config.issuer + "/jwks" };
  for (const [key, value] of Object.entries(expected)) if (metadata[key] !== value) throw new AuthError("PROVIDER_CONFIGURATION", 503);
  return client;
}
export async function authorization(protocol: ProtocolState, requireFresh: boolean) {
  const c = centerConfig();
  const parameters: Record<string, string> = { redirect_uri: c.callback, response_type: "code", scope: c.scope, state: protocol.state, nonce: protocol.nonce, code_challenge: await oidc.calculatePKCECodeChallenge(protocol.verifier), code_challenge_method: "S256" };
  if (requireFresh) Object.assign(parameters, { prompt: "login", max_age: "0" });
  try { return oidc.buildAuthorizationUrl(await configuration(), parameters).href; }
  catch (error) { return invalidProtocol(error); }
}
function invalidProtocol(error: unknown): never {
  if (error instanceof AuthError) throw error;
  if (error instanceof oidc.ResponseBodyError && ["invalid_client", "server_error", "temporarily_unavailable"].includes(error.error)) throw new AuthError("CENTER_UNAVAILABLE", 503);
  if (error instanceof oidc.ClientError && ["OAUTH_TIMEOUT", "OAUTH_RESPONSE_IS_NOT_JSON", "OAUTH_RESPONSE_IS_NOT_CONFORM"].includes(error.code ?? "")) throw new AuthError("CENTER_UNAVAILABLE", 503);
  if (error instanceof oidc.AuthorizationResponseError || error instanceof oidc.ResponseBodyError || error instanceof oidc.ClientError) throw new AuthError("INVALID_AUTHENTICATION", 401);
  throw new AuthError("CENTER_UNAVAILABLE", 503);
}
export function validateGrant(grant: oidc.IntrospectionResponse, expected?: Pick<Candidate, "sub" | "sid" | "exp">) {
  const c = centerConfig();
  if (grant.active !== true || typeof grant.sub !== "string" || !grant.sub || typeof grant.sid !== "string" || !grant.sid || grant.client_id !== c.clientId || typeof grant.exp !== "number" || grant.exp <= Math.floor(Date.now() / 1000) || !c.scope.split(" ").every(scope => String(grant.scope ?? "").split(" ").includes(scope)) || (expected && (grant.sub !== expected.sub || grant.sid !== expected.sid || grant.exp !== expected.exp))) throw new AuthError("SESSION_REVOKED");
  return { sub: grant.sub, sid: grant.sid, exp: grant.exp };
}
export async function introspect(grant: string, expected?: Pick<Candidate, "sub" | "sid" | "exp">) {
  try { return validateGrant(await oidc.tokenIntrospection(await configuration(), grant), expected); }
  catch (error) { return invalidProtocol(error); }
}
export async function exchange(url: URL, protocol: ProtocolState, reauthAfter: Date | null): Promise<Candidate> {
  try {
    const callback = new URL(centerConfig().callback);
    if (url.href.length > 8192 || url.pathname !== callback.pathname || url.hash) throw new AuthError("INVALID_CALLBACK", 400);
    // Next can expose an internal origin behind a proxy. Exchange only against
    // the registered callback, retaining the original protocol parameters.
    callback.search = url.search;
    const allowed = url.searchParams.has("error") ? ["error", "state", "iss", "error_description"] : ["code", "state", "iss"];
    for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new AuthError("INVALID_CALLBACK", 400);
    if (url.searchParams.has("iss") && url.searchParams.get("iss") !== centerConfig().issuer) throw new AuthError("INVALID_ISSUER");
    const client = await configuration();
    const token = await oidc.authorizationCodeGrant(client, callback, { pkceCodeVerifier: protocol.verifier, expectedState: protocol.state, expectedNonce: protocol.nonce, idTokenExpected: true });
    const claims = token.claims();
    if (!token.id_token || !claims || (reauthAfter && !freshAuth(claims.auth_time, claims.iat, reauthAfter))) throw new AuthError("FRESH_AUTH_REQUIRED");
    const info = await oidc.fetchUserInfo(client, token.access_token, claims.sub);
    if (info.email_verified !== true || typeof info.email !== "string") throw new AuthError("VERIFIED_EMAIL_REQUIRED");
    const grant = await introspect(token.access_token);
    if (grant.sub !== claims.sub) throw new AuthError("INVALID_SUBJECT");
    return { issuer: centerConfig().issuer, sub: grant.sub, email: info.email, name: typeof info.name === "string" ? info.name : "", grant: token.access_token, sid: grant.sid, exp: grant.exp, authTime: claims.auth_time, iat: claims.iat };
  } catch (error) { return invalidProtocol(error); }
}
