import { RebuildError, type DataRow } from "./contracts";

export type SourceQuery = (sql: string, values?: unknown[]) => Promise<{ rows: DataRow[] }>;
export type SourceAccess = { readOnlyTransaction: true; managedCronHistoryDelete: boolean };

export const sourceRoleSql = `SELECT r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
  EXISTS(SELECT 1 FROM pg_catalog.pg_roles candidate
    WHERE candidate.oid<>r.oid AND pg_has_role(current_user,candidate.oid,'MEMBER')
    AND (candidate.rolsuper OR candidate.rolcreaterole OR candidate.rolcreatedb
      OR candidate.rolreplication OR candidate.rolbypassrls OR EXISTS(
        SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r','p','v','f','m') AND
        (has_table_privilege(candidate.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
          OR has_any_column_privilege(candidate.oid,c.oid,'INSERT,UPDATE'))))) AS can_assume_writer
  FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`;

export const sourceWritesSql = `SELECT n.nspname AS schema_name,c.relname AS relation_name,c.relkind,
  c.relowner=r.oid AS is_owner,c.relrowsecurity AS rls,
  has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
  has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
  has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete,
  has_table_privilege(r.oid,c.oid,'TRUNCATE') AS can_truncate,
  has_table_privilege(r.oid,c.oid,'TRIGGER') AS can_trigger,
  has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE') AS can_write_column,
  EXISTS(SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid
    WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid AND d.objsubid=0
    AND d.refclassid='pg_catalog.pg_extension'::regclass AND d.deptype='e' AND e.extname='pg_cron') AS pg_cron_member,
  EXISTS(SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee=0
    AND a.privilege_type='DELETE' AND NOT a.is_grantable) AS public_delete,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('permissive',p.polpermissive,'command',p.polcmd,
    'publicOnly',p.polroles=ARRAY[0::oid],'using',pg_get_expr(p.polqual,p.polrelid),
    'check',pg_get_expr(p.polwithcheck,p.polrelid))) FROM pg_catalog.pg_policy p
    WHERE p.polrelid=c.oid),'[]'::jsonb) AS policies
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_roles r ON r.rolname=current_user
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p','v','f','m')
    AND (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE'))`;

export function isManagedCronHistoryDelete(row: DataRow): boolean {
  if (
    row.schema_name !== "cron" ||
    row.relation_name !== "job_run_details" ||
    row.relkind !== "r" ||
    row.pg_cron_member !== true ||
    row.public_delete !== true ||
    row.rls !== true ||
    row.is_owner !== false ||
    row.can_delete !== true ||
    ["can_insert", "can_update", "can_truncate", "can_trigger", "can_write_column"].some(
      (key) => row[key] !== false
    ) ||
    !Array.isArray(row.policies) ||
    row.policies.length !== 1
  )
    return false;
  const policy = row.policies[0];
  return (
    typeof policy === "object" &&
    policy !== null &&
    policy.permissive === true &&
    policy.command === "*" &&
    policy.publicOnly === true &&
    policy.check === null &&
    typeof policy.using === "string" &&
    policy.using.replace(/\s/g, "") === "(username=CURRENT_USER)"
  );
}

export async function assertSourceAccess(query: SourceQuery): Promise<SourceAccess> {
  const transaction = await query("SELECT current_setting('transaction_read_only') AS read_only");
  if (transaction.rows.length !== 1 || transaction.rows[0].read_only !== "on")
    throw new RebuildError("SOURCE_TRANSACTION_NOT_READ_ONLY");
  const roles = await query(sourceRoleSql);
  const deny = [
    "rolsuper",
    "rolcreaterole",
    "rolcreatedb",
    "rolreplication",
    "rolbypassrls",
    "can_assume_writer",
  ];
  if (roles.rows.length !== 1 || deny.some((key) => roles.rows[0][key] !== false))
    throw new RebuildError("SOURCE_ROLE_NOT_READ_ONLY");
  const writes = await query(sourceWritesSql);
  if (writes.rows.length > 1 || writes.rows.some((row) => !isManagedCronHistoryDelete(row)))
    throw new RebuildError("SOURCE_ROLE_NOT_READ_ONLY");
  return { readOnlyTransaction: true, managedCronHistoryDelete: writes.rows.length === 1 };
}
