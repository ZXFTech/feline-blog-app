// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  selectConfiguration,
  serverConfiguration,
  resolveDatabaseSchema,
} from "@/lib/auth/sdk/configuration";

const input = () => ({
  schemaVersion: 1,
  centers: {
    development: "https://auth.user-center.test:3000/api/auth",
    staging: "https://auth-staging.example.com/api/auth",
    production: "https://auth.example.com/api/auth",
  },
  runtimes: Object.fromEntries(
    ["development", "staging", "production"].map((name) => [
      name,
      {
        platformOrigin:
          name === "development"
            ? "https://blog.user-center.test:3443"
            : `https://blog-${name}.example.com`,
        sessionSecretEnv: `SESSION_${name.toUpperCase()}`,
        database: {
          urlEnv: `DATABASE_${name.toUpperCase()}`,
          hostname: `${name}.db.example.test`,
          port: 5432,
          database: `blog_${name}`,
          username: `runtime_${name}`,
        },
        clients: Object.fromEntries(
          (name === "development" ? ["development", "staging", "production"] : [name]).map(
            (target) => [
              target,
              {
                clientId: `${name}-to-${target}`,
                clientSecretEnv: `CLIENT_${name.toUpperCase()}_${target.toUpperCase()}`,
              },
            ]
          )
        ),
      },
    ])
  ),
  authBasePath: "/api/auth",
  returnTo: {
    fallback: "/profile",
    allowedPaths: ["/", "/profile"],
    allowedPathPrefixes: ["/checklists"],
    allowedQueryKeys: [],
  },
  errorPath: "/auth/error",
});
const env = {
  USER_CENTER_RUNTIME_ENVIRONMENT: "development",
  SESSION_DEVELOPMENT: "s".repeat(48),
  CLIENT_DEVELOPMENT_DEVELOPMENT: "c".repeat(48),
  CLIENT_DEVELOPMENT_PRODUCTION: "p".repeat(48),
  DATABASE_DEVELOPMENT:
    "postgresql://runtime_development:synthetic@development.db.example.test/blog_development",
  PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA:
    "-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----",
};

describe("SDK host environment selection", () => {
  it("keeps local namespace public when the center target is production", () => {
    const server = serverConfiguration(
      selectConfiguration(input(), { ...env, USER_CENTER_TARGET_ENVIRONMENT: "production" }),
      env
    );
    expect(server.databaseSchema).toBe("public");
    expect(server.poolConfig.options).toBe("-c search_path=public,pg_catalog,public");
  });
  it.each([undefined, "", "public", "feline_sdk_prod;SET ROLE postgres"])(
    "requires the exact production namespace %s",
    (schema) => {
      expect(() =>
        resolveDatabaseSchema("production", { PLATFORM_PRODUCTION_POSTGRES_SCHEMA: schema })
      ).toThrow("ENVIRONMENT_MISMATCH");
    }
  );
  it("selects the production namespace separately from center and database credentials", () => {
    const values = {
      USER_CENTER_RUNTIME_ENVIRONMENT: "production",
      PLATFORM_PRODUCTION_POSTGRES_SCHEMA: "feline_sdk_prod",
      SESSION_PRODUCTION: "s".repeat(48),
      CLIENT_PRODUCTION_PRODUCTION: "c".repeat(48),
      DATABASE_PRODUCTION:
        "postgresql://runtime_production:synthetic@production.db.example.test/blog_production",
      PLATFORM_PRODUCTION_POSTGRES_SSL_CA: env.PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA,
    };
    const server = serverConfiguration(selectConfiguration(input(), values), values);
    expect(server.databaseSchema).toBe("feline_sdk_prod");
    expect(server.poolConfig.options).toBe("-c search_path=feline_sdk_prod,pg_catalog,public");
    expect(server.databaseUrl).toBe(values.DATABASE_PRODUCTION);
  });
  it("defaults target to runtime and derives the callback with the public SDK", () => {
    const selected = selectConfiguration(input(), env);
    expect(selected.environment).toEqual({
      runtimeEnvironment: "development",
      targetEnvironment: "development",
    });
    expect(selected.publicConfig.callbackUrl).toContain(
      "https://blog.user-center.test:3443/api/auth/callback/user-center-"
    );
  });
  it("local explicit remote selection preserves local storage, origin and session secret", () => {
    const selected = selectConfiguration(input(), {
      ...env,
      USER_CENTER_TARGET_ENVIRONMENT: "production",
    });
    const server = serverConfiguration(selected, env);
    expect(selected.environment.targetEnvironment).toBe("production");
    expect(selected.manifest.platformOrigin).toBe("https://blog.user-center.test:3443");
    expect(server.databaseUrl).toBe(env.DATABASE_DEVELOPMENT);
    expect(server.sessionSecret).toBe(env.SESSION_DEVELOPMENT);
    expect(server.clientSecret).toBe(env.CLIENT_DEVELOPMENT_PRODUCTION);
  });
  it.each([
    ["staging", "development"],
    ["staging", "production"],
    ["production", "development"],
    ["production", "staging"],
  ])("rejects %s targeting %s", (runtime, target) => {
    expect(() =>
      selectConfiguration(input(), {
        USER_CENTER_RUNTIME_ENVIRONMENT: runtime,
        USER_CENTER_TARGET_ENVIRONMENT: target,
      })
    ).toThrow("ENVIRONMENT_MISMATCH");
  });
  it.each([undefined, "", "preview"])("rejects missing or invalid runtime %s", (runtime) => {
    expect(() =>
      selectConfiguration(input(), { USER_CENTER_RUNTIME_ENVIRONMENT: runtime })
    ).toThrow("ENVIRONMENT_MISMATCH");
  });
  it("rejects missing profile, selected client and credential rather than falling back", () => {
    const profiles = input();
    delete profiles.runtimes.development.clients.production;
    expect(() =>
      selectConfiguration(profiles, { ...env, USER_CENTER_TARGET_ENVIRONMENT: "production" })
    ).toThrow("ENVIRONMENT_MISMATCH");
    const selected = selectConfiguration(input(), env);
    expect(() =>
      serverConfiguration(selected, {
        ...env,
        CLIENT_DEVELOPMENT_DEVELOPMENT: "",
        USER_CENTER_CLIENT_SECRET: "old-flat-credential",
      })
    ).toThrow("ENVIRONMENT_MISMATCH");
  });
  it.each([
    "postgresql://runtime_development:synthetic@other.db.example.test/blog_development",
    "postgresql://runtime_development:synthetic@development.db.example.test:6543/blog_development",
    "postgresql://runtime_development:synthetic@development.db.example.test/other",
    "postgresql://runtime_production:synthetic@development.db.example.test/blog_development",
    "postgresql://runtime_development:synthetic@development.db.example.test/blog_development?options=-csearch_path=other",
  ])("rejects wrong runtime database routing before constructing an adapter", (databaseUrl) => {
    expect(() =>
      serverConfiguration(selectConfiguration(input(), env), {
        ...env,
        DATABASE_DEVELOPMENT: databaseUrl,
      })
    ).toThrow("ENVIRONMENT_MISMATCH");
  });
  it("requires runtime CA and independent secrets", () => {
    const selected = selectConfiguration(input(), env);
    expect(() =>
      serverConfiguration(selected, {
        ...env,
        PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA: "",
        POSTGRES_SSL_CA: env.PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA,
      })
    ).toThrow("ENVIRONMENT_MISMATCH");
    expect(() =>
      serverConfiguration(selected, {
        ...env,
        CLIENT_DEVELOPMENT_DEVELOPMENT: env.SESSION_DEVELOPMENT,
      })
    ).toThrow("ENVIRONMENT_MISMATCH");
  });
  it("captures an immutable selected profile rather than sharing the caller's object", () => {
    const profiles = input();
    const selected = selectConfiguration(profiles, env);
    profiles.runtimes.development.platformOrigin = "https://other.example.test";
    expect(selected.manifest.platformOrigin).toBe("https://blog.user-center.test:3443");
    expect(Object.isFrozen(selected.manifest.returnTo.allowedPaths)).toBe(true);
  });
});
