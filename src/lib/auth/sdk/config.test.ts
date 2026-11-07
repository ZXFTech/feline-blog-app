// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ read: vi.fn(), stat: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: io.read, statSync: io.stat }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("uses one profile and credential snapshot for server and page configuration until restart", async () => {
  const profiles = {
    schemaVersion: 1,
    centers: { development: "https://center.example.test/api/auth" },
    runtimes: {
      development: {
        platformOrigin: "https://blog.example.test",
        sessionSecretEnv: "SNAPSHOT_SESSION",
        database: {
          urlEnv: "SNAPSHOT_DATABASE",
          hostname: "db.example.test",
          port: 5432,
          database: "new_target",
          username: "sdk_runtime",
        },
        clients: { development: { clientId: "new-client", clientSecretEnv: "SNAPSHOT_CLIENT" } },
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
  };
  io.stat.mockReturnValue({ size: 1000 });
  io.read.mockReturnValue(JSON.stringify(profiles));
  for (const [key, value] of Object.entries({
    USER_CENTER_CONFIG_FILE: "synthetic.profiles.json",
    USER_CENTER_RUNTIME_ENVIRONMENT: "development",
    SNAPSHOT_SESSION: "s".repeat(48),
    SNAPSHOT_CLIENT: "c".repeat(48),
    SNAPSHOT_DATABASE: "postgresql://sdk_runtime:synthetic@db.example.test/new_target",
    PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA:
      "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
  }))
    vi.stubEnv(key, value);
  const { getSdkConfiguration, getSdkServerConfiguration } = await import("./config");
  const selected = getSdkConfiguration();
  profiles.runtimes.development.clients.development.clientId = "changed-client";
  io.read.mockReturnValue(JSON.stringify(profiles));
  vi.stubEnv("SNAPSHOT_CLIENT", "changed-secret");
  vi.stubEnv("USER_CENTER_TARGET_ENVIRONMENT", "production");
  const server = getSdkServerConfiguration();
  expect(server.manifest).toBe(selected.manifest);
  expect(server.manifest.clientId).toBe("new-client");
  expect(server.clientSecret).toBe("c".repeat(48));
  expect(server.environment.targetEnvironment).toBe("development");
  expect(io.read).toHaveBeenCalledTimes(1);
});

it("loads the selected production bundle when Proxy has no runtime config file", async () => {
  io.read.mockReset().mockImplementation(() => {
    throw Error("ENOENT");
  });
  io.stat.mockReset().mockImplementation(() => {
    throw Error("ENOENT");
  });
  vi.stubEnv("USER_CENTER_CONFIG_FILE", "config/user-center.production.profiles.json");
  vi.stubEnv("USER_CENTER_RUNTIME_ENVIRONMENT", "production");
  vi.stubEnv("USER_CENTER_TARGET_ENVIRONMENT", "production");
  const { getSdkConfiguration } = await import("./config");
  expect(getSdkConfiguration().manifest.issuer).toBe("https://auth.zhaosie.com/api/auth");
  expect(getSdkConfiguration().environment).toMatchObject({
    runtimeEnvironment: "production",
    targetEnvironment: "production",
  });
  expect(io.read).not.toHaveBeenCalled();
  expect(io.stat).not.toHaveBeenCalled();
});

it("does not fall back to production when another configured file is missing", async () => {
  io.read.mockReset().mockImplementation(() => {
    throw Error("ENOENT");
  });
  io.stat.mockReset().mockImplementation(() => {
    throw Error("ENOENT");
  });
  vi.stubEnv("USER_CENTER_CONFIG_FILE", "missing.profiles.json");
  vi.stubEnv("USER_CENTER_RUNTIME_ENVIRONMENT", "production");
  const { getSdkConfiguration } = await import("./config");
  expect(() => getSdkConfiguration()).toThrow("ENVIRONMENT_MISMATCH");
});
