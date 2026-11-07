// @vitest-environment node
import { expect, it } from "vitest";
import { ciReplayTarget } from "./sdk-production-replay";

const fixture = {
  CI: "true",
  CI_SDK_REPLAY: "1",
  CI_SDK_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/postgres",
};
it("accepts only the explicit passwordless loopback CI fixture", () => {
  expect(ciReplayTarget(fixture).hostname).toBe("127.0.0.1");
});
it.each([
  { ...fixture, CI: undefined },
  { ...fixture, CI_SDK_REPLAY: undefined },
  {
    ...fixture,
    CI_SDK_DATABASE_URL: undefined,
    POSTGRES_MIGRATION_URL: fixture.CI_SDK_DATABASE_URL,
  },
  { ...fixture, CI_SDK_DATABASE_URL: "postgresql://postgres@db.example.com:5432/postgres" },
  { ...fixture, CI_SDK_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/live_blog" },
  { ...fixture, CI_SDK_DATABASE_URL: "postgresql://owner@127.0.0.1:5432/postgres" },
  {
    ...fixture,
    CI_SDK_DATABASE_URL: "postgresql://postgres:real-password@127.0.0.1:5432/postgres",
  },
  { ...fixture, CI_SDK_DATABASE_URL: fixture.CI_SDK_DATABASE_URL + "?sslmode=disable" },
])("rejects external, inherited or non-fixture targets %#", (env) => {
  expect(() => ciReplayTarget(env)).toThrow("CI_REPLAY_TARGET_REJECTED");
});
