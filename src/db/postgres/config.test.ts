import { describe, expect, it } from "vitest";
import { buildPostgresPoolConfig } from "./config";

const validUrl = "postgresql://runtime:secret@example.invalid:5432/app";
const validEnvironment = {
  POSTGRES_DATABASE_URL: validUrl,
  POSTGRES_SSL_CA: "test-ca",
};

describe("buildPostgresPoolConfig", () => {
  it("builds a bounded runtime pool that supports concurrent requests", () => {
    const config = buildPostgresPoolConfig(validEnvironment);

    expect(config).toMatchObject({
      connectionString: validUrl,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
  });

  it("accepts explicit positive pool and timeout settings", () => {
    const config = buildPostgresPoolConfig({
      POSTGRES_DATABASE_URL: validUrl,
      POSTGRES_SSL_CA: "test-ca",
      POSTGRES_POOL_MAX: "3",
      POSTGRES_CONNECT_TIMEOUT_MS: "4000",
      POSTGRES_IDLE_TIMEOUT_MS: "5000",
      POSTGRES_QUERY_TIMEOUT_MS: "6000",
    });

    expect(config).toMatchObject({
      max: 3,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 5000,
      query_timeout: 6000,
    });
  });

  it("fails when the runtime URL is missing", () => {
    expect(() => buildPostgresPoolConfig({})).toThrow("POSTGRES_DATABASE_URL is required");
  });

  it("fails when the trusted root certificate is missing", () => {
    expect(() => buildPostgresPoolConfig({ POSTGRES_DATABASE_URL: validUrl })).toThrow(
      "POSTGRES_SSL_CA is required"
    );
  });

  it.each(["not-a-url", "mysql://user:secret@example.invalid/app"])(
    "rejects an invalid PostgreSQL URL: %s",
    (connectionString) => {
      expect(() =>
        buildPostgresPoolConfig({
          POSTGRES_DATABASE_URL: connectionString,
          POSTGRES_SSL_CA: "test-ca",
        })
      ).toThrow();
    }
  );

  it.each(["disable", "no-verify"])("rejects sslmode=%s", (sslmode) => {
    expect(() =>
      buildPostgresPoolConfig({
        POSTGRES_DATABASE_URL: `${validUrl}?sslmode=${sslmode}`,
        POSTGRES_SSL_CA: "test-ca",
      })
    ).toThrow("must not disable TLS verification");
  });

  it("uses a strict CA object when POSTGRES_SSL_CA is supplied", () => {
    const config = buildPostgresPoolConfig({
      POSTGRES_DATABASE_URL: validUrl,
      POSTGRES_SSL_CA: "line-one\\nline-two",
    });

    expect(config.ssl).toEqual({ ca: "line-one\nline-two", rejectUnauthorized: true });
  });

  it("rejects SSL URL parameters that would override the strict CA object", () => {
    expect(() =>
      buildPostgresPoolConfig({
        POSTGRES_DATABASE_URL: `${validUrl}?sslmode=verify-full`,
        POSTGRES_SSL_CA: "certificate",
      })
    ).toThrow("cannot be combined");
  });

  it("rejects non-positive numeric settings", () => {
    expect(() =>
      buildPostgresPoolConfig({
        POSTGRES_DATABASE_URL: validUrl,
        POSTGRES_POOL_MAX: "0",
        POSTGRES_SSL_CA: "test-ca",
      })
    ).toThrow("POSTGRES_POOL_MAX must be a positive integer");
  });
});
