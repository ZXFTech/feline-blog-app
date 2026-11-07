// Local protocol fixtures only. No host environment, center source or real database.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createUserCenterAuth } from "@user-center/next-better-auth/server";
import { TOOL_VERSION } from "@user-center/next-better-auth/public";
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "synthetic-fixture",
  alg: "RS256",
  use: "sig",
};
const originalFetch = globalThis.fetch;
let passed = 0;
try {
  for (const [name, declaration, expected] of [
    ["same environment", "development", "OK"],
    ["wrong center environment", "production", "ENVIRONMENT_MISMATCH"],
    ["missing center environment", undefined, "ENVIRONMENT_MISMATCH"],
    ["unknown center environment", "preview", "ENVIRONMENT_MISMATCH"],
  ]) {
    const issuer = `https://fixture-${passed}.user-center.test/api/auth`;
    const data = { user: [], account: [], session: [], verification: [] };
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin !== new URL(issuer).origin) throw Error("UNEXPECTED_NETWORK_ATTEMPT");
      if (url.pathname.includes(".well-known/openid-configuration"))
        return Response.json({
          issuer,
          authorization_endpoint: issuer + "/oauth2/authorize",
          token_endpoint: issuer + "/oauth2/token",
          userinfo_endpoint: issuer + "/oauth2/userinfo",
          jwks_uri: issuer + "/jwks",
          scopes_supported: ["openid", "profile", "email"],
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_basic"],
          code_challenge_methods_supported: ["S256"],
          ...(declaration === undefined ? {} : { user_center_environment: declaration }),
        });
      if (url.pathname === "/api/auth/jwks") return Response.json({ keys: [jwk] });
      throw Error("UNEXPECTED_NETWORK_ATTEMPT");
    };
    const integration = createUserCenterAuth({
      manifest: {
        schemaVersion: 1,
        issuer,
        platformOrigin: "https://blog.user-center.test:3443",
        clientId: "synthetic-client",
        clientSecretEnv: "FIXTURE_CLIENT_SECRET",
        sessionSecretEnv: "FIXTURE_SESSION_SECRET",
        returnTo: {
          fallback: "/profile",
          allowedPaths: ["/profile"],
          allowedPathPrefixes: [],
          allowedQueryKeys: [],
        },
        errorPath: "/auth/error",
      },
      environment: { runtimeEnvironment: "development", targetEnvironment: "development" },
      database: memoryAdapter(data),
      clientSecret: "fixture-client-secret-that-is-not-real",
      sessionSecret: "fixture-session-secret-that-is-not-real",
      authUserPolicy: "allow-new",
      async resolveBusinessUser() {
        return { status: "unmapped" };
      },
    });
    if (expected === "OK") await integration.ready();
    else await assert.rejects(integration.ready(), (error) => error?.code === expected);
    assert.deepEqual(
      Object.values(data).map((rows) => rows.length),
      [0, 0, 0, 0]
    );
    console.log(
      JSON.stringify({
        fixture: name,
        result: "PASS",
        databaseConnected: false,
        realNetworkUsed: false,
      })
    );
    passed++;
  }
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  JSON.stringify({
    passed,
    scope: `SDK ${TOOL_VERSION} synthetic environment declaration fixtures`,
    databaseConnected: false,
    realAuthenticationVerified: false,
  })
);
