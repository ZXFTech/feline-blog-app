import { afterEach, describe, expect, it } from "vitest";
import {
  assertStrongPassword,
  connectionTarget,
  roleFromUrl,
  validateConfiguration,
} from "./configure-postgres-roles";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("PostgreSQL role configuration safety", () => {
  it("extracts custom Supavisor roles without exposing credentials", () => {
    const url = new URL(
      "postgresql://app_runtime.project-ref:secret@region.pooler.supabase.com:6543/postgres"
    );
    expect(roleFromUrl(url)).toBe("app_runtime");
    expect(connectionTarget(url)).toBe("project-ref/postgres");
  });

  it("rejects weak or shared role passwords", () => {
    expect(() => assertStrongPassword("POSTGRES_RUNTIME_PASSWORD", "too-short")).toThrow(
      "at least 24 characters"
    );
    const password = "runtime-password-with-24-chars";
    expect(() => assertStrongPassword("POSTGRES_MIGRATOR_PASSWORD", password, password)).toThrow(
      "must be different"
    );
  });

  it("fails closed without the explicit mutation gate", () => {
    process.env.POSTGRES_ENVIRONMENT = "development";
    process.env.POSTGRES_CONFIGURE_ROLES = "false";
    expect(() => validateConfiguration()).toThrow("POSTGRES_CONFIGURE_ROLES=true");
  });

  it("rejects role configuration in production", () => {
    process.env.POSTGRES_ENVIRONMENT = "production";
    process.env.POSTGRES_CONFIGURE_ROLES = "true";
    expect(() => validateConfiguration()).toThrow("allowed only");
  });
});
