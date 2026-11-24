import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect } from "node:net";
import {
  describeIntegration,
  resolveEnvironmentConfig,
} from "@user-center/next-better-auth/config";

const app = "https://blog.user-center.test:3446";
const base = "https://127.0.0.1:3447";
const issuer = base + "/api/auth";
const env = process.env;
if (env.BLOG_DRAFT_E2E_ORIGIN !== app || env.USER_CENTER_RUNTIME_ENVIRONMENT !== "development") {
  throw new Error("The draft fixture issuer is only available in the isolated development test.");
}
const { manifest } = resolveEnvironmentConfig(
  JSON.parse(readFileSync(env.USER_CENTER_CONFIG_FILE, "utf8")),
  { runtimeEnvironment: "development", targetEnvironment: "development" }
);
if (manifest.platformOrigin !== app || manifest.issuer !== issuer) {
  throw new Error("The draft fixture issuer only accepts the fixed local platform and issuer.");
}
const clientSecret = env[manifest.clientSecretEnv];
if (!clientSecret || clientSecret.length < 32) throw new Error("Missing disposable client secret.");

const { callbackUrl } = describeIntegration(manifest);
const basicAuth = "Basic " + Buffer.from(manifest.clientId + ":" + clientSecret).toString("base64");
const accountNames = { author: "Draft author", other: "Another author", reader: "Draft reader" };
const discovery = {
  issuer,
  authorization_endpoint: issuer + "/oauth2/authorize",
  token_endpoint: issuer + "/oauth2/token",
  userinfo_endpoint: issuer + "/oauth2/userinfo",
  jwks_uri: issuer + "/jwks",
  scopes_supported: ["openid", "profile", "email"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
  code_challenge_methods_supported: ["S256"],
  user_center_environment: "development",
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kid = "disposable-draft-issuer";
const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
const authorizeCodes = new Map();
const accessTokens = new Map();

function json(response, value, status = 200) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function profile(account) {
  return {
    sub: "draft-fixture-" + account,
    name: accountNames[account],
    email: account + "@drafts.example.test",
    email_verified: true,
  };
}

function createIdToken(account, nonce) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    ...profile(account),
    nonce,
    iss: issuer,
    aud: manifest.clientId,
    iat,
    exp: iat + 60,
  };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = encode({ kid, alg: "RS256", typ: "JWT" }) + "." + encode(claims);
  return content + "." + sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url");
}

function authorize(request, response, params) {
  const account = (request.headers.cookie ?? "").match(/(?:^|; )draft_fixture_account=(\w+)/)?.[1];
  const state = params.get("state");
  const nonce = params.get("nonce");
  const challenge = params.get("code_challenge");
  if (
    params.get("client_id") !== manifest.clientId ||
    params.get("redirect_uri") !== callbackUrl ||
    params.get("code_challenge_method") !== "S256" ||
    params.get("response_type") !== "code" ||
    !account ||
    !Object.hasOwn(accountNames, account) ||
    !state ||
    !nonce ||
    !challenge
  ) {
    return json(response, { error: "invalid_request" }, 400);
  }
  const code = randomUUID();
  authorizeCodes.set(code, { account, nonce, challenge, expiresAt: Date.now() + 60_000 });
  const target = new URL(callbackUrl);
  target.searchParams.set("code", code);
  target.searchParams.set("state", state);
  response.writeHead(302, { Location: target.href, "Cache-Control": "no-store" });
  response.end();
}

async function issueToken(request, response) {
  if (request.headers.authorization !== basicAuth) {
    return json(response, { error: "invalid_client" }, 401);
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) return json(response, { error: "invalid_request" }, 400);
  }
  const params = new URLSearchParams(body);
  const code = params.get("code");
  const binding = authorizeCodes.get(code);
  authorizeCodes.delete(code);
  const challenge = createHash("sha256")
    .update(params.get("code_verifier") ?? "")
    .digest("base64url");
  if (
    !binding ||
    binding.expiresAt <= Date.now() ||
    binding.challenge !== challenge ||
    params.get("grant_type") !== "authorization_code" ||
    params.get("redirect_uri") !== callbackUrl
  ) {
    return json(response, { error: "invalid_grant" }, 400);
  }
  const token = randomUUID();
  accessTokens.set(token, binding.account);
  json(response, {
    token_type: "Bearer",
    expires_in: 60,
    access_token: token,
    id_token: createIdToken(binding.account, binding.nonce),
  });
}

async function handle(request, response) {
  const url = new URL(request.url, base);
  switch (request.method + " " + url.pathname) {
    case "GET /api/auth/.well-known/openid-configuration":
      return json(response, discovery);
    case "GET /api/auth/jwks":
      return json(response, { keys: [jwk] });
    case "GET /api/auth/oauth2/authorize":
      return authorize(request, response, url.searchParams);
    case "POST /api/auth/oauth2/token":
      return issueToken(request, response);
    case "GET /api/auth/oauth2/userinfo": {
      const token = request.headers.authorization?.slice("Bearer ".length);
      const account = accessTokens.get(token);
      accessTokens.delete(token);
      return account
        ? json(response, profile(account))
        : json(response, { error: "invalid_token" }, 401);
    }
    default:
      return json(response, { error: "not_found" }, 404);
  }
}

const tls = {
  key: readFileSync(env.BLOG_DRAFT_E2E_KEY),
  cert: readFileSync(env.BLOG_DRAFT_E2E_CERT),
};
createHttpsServer(tls, (request, response) => {
  handle(request, response).catch(() => json(response, { error: "fixture_error" }, 500));
}).listen(3447, "127.0.0.1", () => console.log("Disposable loopback issuer ready."));

// Give both browser engines access to the named local HTTPS origin without changing system DNS.
const proxy = createHttpServer((_, response) => response.writeHead(404).end());
proxy.on("connect", (request, client, head) => {
  if (request.url !== new URL(app).host) {
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const upstream = connect(3446, "127.0.0.1", () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    client.pipe(upstream).pipe(client);
  });
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
});
proxy.listen(3448, "127.0.0.1");
