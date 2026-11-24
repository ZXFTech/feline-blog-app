import { describe, expect, it, vi } from "vitest";
import { assertCopyRls, beginCopySnapshot, reconcileExporterPolicies } from "./rls-copy";

type Client = Parameters<typeof assertCopyRls>[0];

const draft = {
  name: "BlogDraft",
  enabled: true,
  full_select: true,
  restrictive_read: false,
};

function clientWith(rows: unknown[]) {
  return { query: vi.fn(async () => ({ rows })) } as unknown as Client;
}

describe("private staging copy RLS contract", () => {
  // spec 0016 covers: AC-15. Policy repair cannot silently loosen an invalid source.
  it.each([
    { ...draft, enabled: false },
    { ...draft, name: "UnexpectedPrivateTable" },
  ])("refuses policy changes when the initial RLS inventory is unsafe: %j", async (table) => {
    const client = clientWith([table]);
    await expect(reconcileExporterPolicies(client)).rejects.toMatchObject({
      code: "SNAPSHOT_FAILED",
    });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(client.query).mock.calls[0][0]).trimStart()).toMatch(/^SELECT /);
  });

  // spec 0016 covers: AC-15. The policy snapshot must begin after every table lock is acquired.
  it("discovers tables before the transaction and locks them before enabling snapshot reads", async () => {
    const client = clientWith([{ name: "BlogDraft" }, { name: "BlogPublishReceipt" }]);
    await beginCopySnapshot(client);
    const statements = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(statements[0].trimStart()).toMatch(/^SELECT /);
    expect(statements.slice(1)).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      'LOCK TABLE public."BlogDraft", public."BlogPublishReceipt" IN ACCESS SHARE MODE',
      "SET LOCAL row_security = on",
    ]);
  });

  it("accepts exact private tables and a complete exporter policy", async () => {
    await expect(assertCopyRls(clientWith([draft]), true)).resolves.toBeUndefined();
  });

  it.each([
    { name: "OtherPrivateTable" },
    { enabled: false },
    { full_select: false },
    { restrictive_read: true },
  ])("rejects an incomplete exporter contract: %j", async (change) => {
    await expect(assertCopyRls(clientWith([{ ...draft, ...change }]), true)).rejects.toMatchObject({
      code: "ROLE_MISMATCH",
    });
  });

  it("lets a migrated local target keep RLS without a staging exporter policy", async () => {
    await expect(
      assertCopyRls(clientWith([{ ...draft, full_select: false }]))
    ).resolves.toBeUndefined();
  });

  it("refuses disabled RLS even on the local candidate", async () => {
    await expect(assertCopyRls(clientWith([{ ...draft, enabled: false }]))).rejects.toMatchObject({
      code: "SNAPSHOT_FAILED",
    });
  });

  it("repairs only the two owned SELECT policies without changing RLS or other policies", async () => {
    const client = clientWith([{ name: "BlogDraft", enabled: true }]);
    await reconcileExporterPolicies(client);
    const statements = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(statements.slice(2)).toEqual([
      'DROP POLICY IF EXISTS "BlogDraft_exporter_read" ON public."BlogDraft"',
      'CREATE POLICY "BlogDraft_exporter_read" ON public."BlogDraft" AS PERMISSIVE FOR SELECT TO app_exporter USING (true)',
    ]);
  });
});
