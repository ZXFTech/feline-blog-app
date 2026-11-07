// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const config = vi.hoisted(() => ({ schema: "feline_sdk_prod" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sdk/config", () => ({ getSdkDatabaseSchema: () => config.schema }));
import { applicationObject } from "./schema";
beforeEach(() => {
  config.schema = "feline_sdk_prod";
});
it.each(["users", "Checklist", "ChecklistItem", "feline_sdk_lock_installation"] as const)(
  "qualifies %s in the selected production namespace",
  (name) => {
    expect(applicationObject(name).sql).toBe(`"feline_sdk_prod"."${name}"`);
    expect(applicationObject(name).values).toEqual([]);
  }
);
it("keeps the verified local public namespace", () => {
  config.schema = "public";
  expect(applicationObject("users").sql).toBe('"public"."users"');
});
it("rejects arbitrary namespace or relation injection", () => {
  config.schema = 'public"; SELECT 1; --';
  expect(() => applicationObject("users")).toThrow("SCHEMA_BINDING_REJECTED");
  config.schema = "feline_sdk_prod";
  expect(() => applicationObject("users;DROP TABLE users" as never)).toThrow(
    "SCHEMA_BINDING_REJECTED"
  );
});
