import { DatabaseToolError } from "./errors";
import { quoteIdentifier, type connect } from "./local";

type Client = Awaited<ReturnType<typeof connect>>;

export const privateCopyTables = ["BlogDraft", "BlogPublishReceipt"] as const;

interface CopyRlsTable {
  name: string;
  enabled: boolean;
  full_select: boolean;
  restrictive_read: boolean;
}

// Role setup rejects memberships, so only the exporter itself and PUBLIC can apply.
export async function assertCopyRls(client: Client, exporter = false): Promise<void> {
  const result = await client.query<CopyRlsTable>(
    `SELECT c.relname AS name, c.relrowsecurity AS enabled,
      EXISTS (SELECT 1 FROM pg_policy p JOIN pg_roles r ON r.rolname = 'app_exporter'
        WHERE p.polrelid = c.oid AND p.polname = c.relname || '_exporter_read'
          AND p.polcmd = 'r' AND p.polpermissive
          AND p.polroles = ARRAY[r.oid] AND pg_get_expr(p.polqual, p.polrelid) = 'true'
          AND p.polwithcheck IS NULL) AS full_select,
      EXISTS (SELECT 1 FROM pg_policy p
        WHERE p.polrelid = c.oid AND NOT p.polpermissive AND p.polcmd IN ('r', '*')
          AND (0::oid = ANY(p.polroles) OR
            (SELECT oid FROM pg_roles WHERE rolname = 'app_exporter') = ANY(p.polroles)))
        AS restrictive_read
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relrowsecurity OR c.relname = ANY($1::text[]))
    ORDER BY c.relname`,
    [privateCopyTables]
  );
  if (
    result.rows.some(
      (table) =>
        !privateCopyTables.some((name) => name === table.name) ||
        table.enabled !== true ||
        (exporter && (table.full_select !== true || table.restrictive_read !== false))
    )
  ) {
    throw new DatabaseToolError(
      exporter ? "ROLE_MISMATCH" : "SNAPSHOT_FAILED",
      "The private table RLS copy contract is not satisfied."
    );
  }
}

export async function reconcileExporterPolicies(client: Client): Promise<void> {
  await assertCopyRls(client);
  const tables = await client.query<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [privateCopyTables]
  );
  for (const table of tables.rows) {
    const policy = quoteIdentifier(`${table.name}_exporter_read`);
    const qualified = `public.${quoteIdentifier(table.name)}`;
    await client.query(`DROP POLICY IF EXISTS ${policy} ON ${qualified}`);
    await client.query(
      `CREATE POLICY ${policy} ON ${qualified} AS PERMISSIVE FOR SELECT TO app_exporter USING (true)`
    );
  }
}

export async function beginCopySnapshot(client: Client): Promise<void> {
  // Discover outside the repeatable read transaction. Acquire locks before its first
  // snapshot query, so a policy changed while waiting cannot leave stale validation.
  const tables = await client.query<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`
  );
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  if (tables.rows.length) {
    await client.query(
      `LOCK TABLE ${tables.rows.map((table) => `public.${quoteIdentifier(table.name)}`).join(", ")} IN ACCESS SHARE MODE`
    );
  }
  await client.query("SET LOCAL row_security = on");
}
