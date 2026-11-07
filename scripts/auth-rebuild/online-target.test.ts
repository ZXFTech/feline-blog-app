// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { describeIntegration } from "@user-center/next-better-auth/config";
import { onlineTarget as target, onlineServerConfiguration } from "./online-target";
const fixture = () => ({
  schemaVersion: 1,
  centers: { production: target.issuer },
  runtimes: {
    development: {
      platformOrigin: target.origin,
      sessionSecretEnv: target.sessionSecretEnv,
      clients: {
        production: { clientId: "online-local-test", clientSecretEnv: target.clientSecretEnv },
      },
      database: {
        hostname: "127.0.0.1",
        port: target.databasePort,
        database: target.database,
        username: target.runtimeRole,
        urlEnv: target.databaseUrlEnv,
      },
    },
  },
  authBasePath: "/api/auth",
  errorPath: "/auth/error",
  returnTo: {
    fallback: "/profile",
    allowedPaths: ["/profile"],
    allowedPathPrefixes: [],
    allowedQueryKeys: [],
  },
});
const values = () => ({
  USER_CENTER_RUNTIME_ENVIRONMENT: "development",
  USER_CENTER_TARGET_ENVIRONMENT: "production",
  [target.sessionSecretEnv]: "s".repeat(64),
  [target.clientSecretEnv]: "c".repeat(64),
  [target.databaseUrlEnv]: `postgresql://${target.runtimeRole}:fixture@127.0.0.1:${target.databasePort}/${target.database}`,
  PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA:
    "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("keeps platform origin, storage and secrets in development while selecting the online issuer", () => {
  const config = onlineServerConfiguration(fixture(), values());
  expect(config.environment).toEqual({
    runtimeEnvironment: "development",
    targetEnvironment: "production",
  });
  expect(config.manifest.platformOrigin).toBe(target.origin);
  expect(config.database?.port).toBe(54332);
  expect(config.database?.database).toBe(target.database);
  expect(config.manifest.sessionSecretEnv).toBe(target.sessionSecretEnv);
});
it.each(["hostname", "port", "database", "username", "urlEnv"])(
  "rejects another platform storage binding: %s",
  (field) => {
    const input = fixture();
    Object.assign(input.runtimes.development.database, {
      [field]: field === "port" ? 54331 : "other",
    });
    expect(() => onlineServerConfiguration(input, values())).toThrow();
  }
);
it("does not accept a remote connection behind a local profile", () => {
  expect(() =>
    onlineServerConfiguration(fixture(), {
      ...values(),
      [target.databaseUrlEnv]: `postgresql://${target.runtimeRole}:fixture@remote.example.test:${target.databasePort}/${target.database}`,
    })
  ).toThrow();
});
it.each(["development", "staging"])("does not silently select a %s center", (targetEnvironment) => {
  expect(() =>
    onlineServerConfiguration(fixture(), {
      ...values(),
      USER_CENTER_TARGET_ENVIRONMENT: targetEnvironment,
    })
  ).toThrow();
});
it("does not permit a production platform runtime", () => {
  expect(() =>
    onlineServerConfiguration(fixture(), {
      ...values(),
      USER_CENTER_RUNTIME_ENVIRONMENT: "production",
    })
  ).toThrow();
});
it("fails without the selected Client and never falls back to an old secret", () => {
  expect(() =>
    onlineServerConfiguration(fixture(), {
      ...values(),
      [target.clientSecretEnv]: "",
      LOCAL_TO_DEVELOPMENT_CLIENT_SECRET: "old".repeat(24),
    })
  ).toThrow();
  const input = fixture();
  input.runtimes.development.clients.production.clientId = "";
  expect(() => onlineServerConfiguration(input, values())).toThrow();
});
it("does not share Client and session secrets", () => {
  const input = values();
  input[target.sessionSecretEnv] = input[target.clientSecretEnv];
  expect(() => onlineServerConfiguration(fixture(), input)).toThrow();
});
it("separates cookie namespaces even when local modes share one TLS hostname", () => {
  const config = onlineServerConfiguration(fixture(), values());
  const other = describeIntegration({
    ...config.manifest,
    platformOrigin: "https://blog.user-center.test:3443",
  });
  expect(config.publicConfig.providerId).toBe(other.providerId);
  expect(config.publicConfig.cookiePrefix).not.toBe(other.cookiePrefix);
});
it.each([
  ["development", "production", ".next-online-center"],
  ["development", "development", ".next"],
  ["production", "production", ".next"],
])(
  "isolates Next caches only for the explicit local online mode: %s/%s",
  async (runtime, targetEnvironment, expected) => {
    vi.stubEnv("NODE_ENV", runtime);
    vi.stubEnv("FELINE_SDK_DEV_TARGET", targetEnvironment);
    const { default: config } = await import("../../next.config.mjs");
    expect(config.distDir).toBe(expected);
  }
);
