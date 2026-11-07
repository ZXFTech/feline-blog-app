// @vitest-environment node
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import example from "../../config/user-center.online.profiles.example.json";
import { onlineTarget as target } from "./online-target";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  spawn: vi.fn(),
  lookup: vi.fn(),
  stat: vi.fn(),
  storage: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock("./files", () => ({ privateConfigFile: mocks.read }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs/promises", () => ({ stat: mocks.stat }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("./online-postgres", () => ({ assertOnlineStorageReady: mocks.storage }));
vi.mock("./online-metadata", () => ({ checkOnlineMetadata: mocks.metadata }));
import { startDevelopment } from "./development-server";
beforeEach(() => {
  vi.resetAllMocks();
  const profiles = structuredClone(example);
  profiles.runtimes.development.clients.production.clientId = "fixture-online-client";
  const values = {
    USER_CENTER_CONFIG_FILE: path.resolve(".feline-blog/fixture/profiles.json"),
    USER_CENTER_RUNTIME_ENVIRONMENT: "development",
    USER_CENTER_TARGET_ENVIRONMENT: "production",
    [target.sessionSecretEnv]: "s".repeat(64),
    [target.clientSecretEnv]: "c".repeat(64),
    [target.databaseUrlEnv]: `postgresql://${target.runtimeRole}:fixture@127.0.0.1:${target.databasePort}/${target.database}`,
    PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA:
      "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
  };
  mocks.read.mockImplementation(async (file: string) =>
    Buffer.from(
      file.endsWith("profiles.json")
        ? JSON.stringify(profiles)
        : Object.entries(values)
            .map(([k, v]) => k + "=" + JSON.stringify(v))
            .join("\n")
    )
  );
  mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
  mocks.stat.mockResolvedValue({ isFile: () => true });
  mocks.metadata.mockResolvedValue({ status: "PASS" });
  mocks.spawn.mockReturnValue({ on: vi.fn() });
});
afterEach(() => vi.unstubAllEnvs());
it("passes the exact hostname, HTTPS CA and independent port to Next", async () => {
  vi.stubEnv("DATABASE_URL", "ambient-remote-database");
  await startDevelopment(".feline-blog/fixture/env", "online");
  const [, args, options] = mocks.spawn.mock.calls[0];
  expect(args[args.indexOf("--hostname") + 1]).toBe("blog.user-center.test");
  expect(args[args.indexOf("--port") + 1]).toBe("3445");
  expect(args[args.indexOf("--experimental-https-ca") + 1]).toBe(options.env.NODE_EXTRA_CA_CERTS);
  expect(options.env.FELINE_SDK_DEV_TARGET).toBe("production");
  expect(options.env.DATABASE_URL).toBe("");
  expect(options.env.POSTGRES_MIGRATION_URL).toBe("");
  expect(mocks.storage).toHaveBeenCalledOnce();
  expect(mocks.metadata).toHaveBeenCalledOnce();
});
it("does not let the old local-only command select the online center", async () => {
  await expect(startDevelopment(".feline-blog/fixture/env", "local")).rejects.toThrow(
    "LOCAL_DEVELOPMENT_CONFIGURATION_REJECTED"
  );
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it("preserves the local-center port and CA without requiring online preflights", async () => {
  const profiles = {
    ...structuredClone(example),
    centers: { development: "https://auth.user-center.test:3000/api/auth" },
    runtimes: {
      development: {
        platformOrigin: "https://blog.user-center.test:3443",
        sessionSecretEnv: "OLD_SESSION",
        clients: { development: { clientId: "fixture-local", clientSecretEnv: "OLD_CLIENT" } },
        database: {
          hostname: "127.0.0.1",
          port: 54331,
          database: "feline_blog_sdk_dev",
          username: "blog_sdk_runtime",
          urlEnv: "OLD_URL",
        },
      },
    },
  };
  const values = {
    USER_CENTER_CONFIG_FILE: path.resolve(".feline-blog/fixture/profiles.json"),
    USER_CENTER_RUNTIME_ENVIRONMENT: "development",
    USER_CENTER_TARGET_ENVIRONMENT: "development",
    OLD_SESSION: "s".repeat(64),
    OLD_CLIENT: "c".repeat(64),
    OLD_URL: "postgresql://blog_sdk_runtime:fixture@127.0.0.1:54331/feline_blog_sdk_dev",
    PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA:
      "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----",
  };
  mocks.read.mockImplementation(async (file: string) =>
    Buffer.from(
      file.endsWith("profiles.json")
        ? JSON.stringify(profiles)
        : Object.entries(values)
            .map(([k, v]) => k + "=" + JSON.stringify(v))
            .join("\n")
    )
  );
  await startDevelopment(".feline-blog/fixture/env", "local");
  const [, args, options] = mocks.spawn.mock.calls[0];
  expect(args[args.indexOf("--port") + 1]).toBe("3443");
  expect(args[args.indexOf("--experimental-https-ca") + 1]).toBe(options.env.NODE_EXTRA_CA_CERTS);
  expect(options.env.FELINE_SDK_DEV_TARGET).toBe("development");
  expect(mocks.storage).not.toHaveBeenCalled();
  expect(mocks.metadata).not.toHaveBeenCalled();
});
it("does not listen on a hostname resolving outside loopback", async () => {
  mocks.lookup.mockResolvedValue([
    { address: "127.0.0.1", family: 4 },
    { address: "192.0.2.1", family: 4 },
  ]);
  await expect(startDevelopment(".feline-blog/fixture/env", "online")).rejects.toThrow(
    "LOCAL_DNS_BINDING_REJECTED"
  );
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it("does not start after a missing center environment declaration", async () => {
  mocks.metadata.mockResolvedValue({ status: "BLOCKED", code: "ENVIRONMENT_MISMATCH" });
  await expect(startDevelopment(".feline-blog/fixture/env", "online")).rejects.toThrow(
    "ENVIRONMENT_MISMATCH"
  );
  expect(mocks.spawn).not.toHaveBeenCalled();
});
