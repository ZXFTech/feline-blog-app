// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertSourceAccess,
  isManagedCronHistoryDelete,
  sourceRoleSql,
  sourceWritesSql,
} from "./source-access";
import type { DataRow } from "./contracts";

const role = {
  rolsuper: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  can_assume_writer: false,
};
const cron = (): DataRow => ({
  schema_name: "cron",
  relation_name: "job_run_details",
  relkind: "r",
  is_owner: false,
  rls: true,
  pg_cron_member: true,
  public_delete: true,
  can_insert: false,
  can_update: false,
  can_delete: true,
  can_truncate: false,
  can_trigger: false,
  can_write_column: false,
  policies: [
    {
      permissive: true,
      command: "*",
      publicOnly: true,
      using: "(username = CURRENT_USER)",
      check: null,
    },
  ],
});
function query(writes: DataRow[], overrides: DataRow = {}, readOnly = "on") {
  const calls: string[] = [];
  return {
    calls,
    run: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("transaction_read_only")) return { rows: [{ read_only: readOnly }] };
      if (sql === sourceRoleSql) return { rows: [{ ...role, ...overrides }] };
      if (sql === sourceWritesSql) return { rows: writes };
      throw Error("Business records must not be read by the access check");
    },
  };
}
describe("source snapshot access", () => {
  it("accepts an entirely read only source and verifies transaction mode first", async () => {
    const source = query([]);
    await expect(assertSourceAccess(source.run)).resolves.toEqual({
      readOnlyTransaction: true,
      managedCronHistoryDelete: false,
    });
    expect(source.calls[0]).toContain("transaction_read_only");
  });
  it("accepts only the proven pg_cron own-history DELETE exception without changing ACLs", async () => {
    await expect(assertSourceAccess(query([cron()]).run)).resolves.toEqual({
      readOnlyTransaction: true,
      managedCronHistoryDelete: true,
    });
  });
  it.each(["off", "", "true"])(
    "rejects a transaction whose read only setting is %s before checking access",
    async (mode) => {
      const source = query([], {}, mode);
      await expect(assertSourceAccess(source.run)).rejects.toThrow(
        "SOURCE_TRANSACTION_NOT_READ_ONLY"
      );
      expect(source.calls).toHaveLength(1);
    }
  );
  it.each([
    "rolsuper",
    "rolcreaterole",
    "rolcreatedb",
    "rolreplication",
    "rolbypassrls",
    "can_assume_writer",
  ])("rejects privileged role flag %s", async (key) => {
    await expect(assertSourceAccess(query([], { [key]: true }).run)).rejects.toThrow(
      "SOURCE_ROLE_NOT_READ_ONLY"
    );
  });
  it("rejects incomplete role evidence", async () => {
    await expect(assertSourceAccess(query([], { rolbypassrls: undefined }).run)).rejects.toThrow(
      "SOURCE_ROLE_NOT_READ_ONLY"
    );
  });
  it.each([
    ["schema_name", "public"],
    ["relation_name", "job"],
    ["relkind", "v"],
    ["pg_cron_member", false],
    ["public_delete", false],
    ["rls", false],
    ["is_owner", true],
    ["can_insert", true],
    ["can_update", true],
    ["can_truncate", true],
    ["can_trigger", true],
    ["can_write_column", true],
  ])("rejects nonconforming metadata %s", async (key, value) => {
    const row = { ...cron(), [String(key)]: value };
    expect(isManagedCronHistoryDelete(row)).toBe(false);
    await expect(assertSourceAccess(query([row]).run)).rejects.toThrow("SOURCE_ROLE_NOT_READ_ONLY");
  });
  it.each(
    [
      [],
      [
        {
          permissive: false,
          command: "*",
          publicOnly: true,
          using: "(username = CURRENT_USER)",
          check: null,
        },
      ],
      [
        {
          permissive: true,
          command: "d",
          publicOnly: true,
          using: "(username = CURRENT_USER)",
          check: null,
        },
      ],
      [
        {
          permissive: true,
          command: "*",
          publicOnly: false,
          using: "(username = CURRENT_USER)",
          check: null,
        },
      ],
      [{ permissive: true, command: "*", publicOnly: true, using: "true", check: null }],
      [
        {
          permissive: true,
          command: "*",
          publicOnly: true,
          using: "(username = CURRENT_USER)",
          check: "true",
        },
      ],
    ].map((policies) => ({ policies }))
  )("rejects an unproven policy set %#", async ({ policies }) => {
    await expect(assertSourceAccess(query([{ ...cron(), policies }]).run)).rejects.toThrow(
      "SOURCE_ROLE_NOT_READ_ONLY"
    );
  });
  it("rejects an extra policy or another writable relation even when the exact exception exists", async () => {
    const row = cron();
    await expect(
      assertSourceAccess(
        query([{ ...row, policies: [...(row.policies as unknown[]), { using: "true" }] }]).run
      )
    ).rejects.toThrow("SOURCE_ROLE_NOT_READ_ONLY");
    await expect(
      assertSourceAccess(
        query([row, { schema_name: "public", relation_name: "Blog", can_update: true }]).run
      )
    ).rejects.toThrow("SOURCE_ROLE_NOT_READ_ONLY");
  });
});
