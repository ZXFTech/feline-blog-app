import { AuthError } from "./config";
import { query } from "./store";
import {opsReady} from "./ops-readiness";
import type {OpsDiagnostic} from '@/lib/auth/center/ops-diagnostics';
export async function ensureAuthReady(diagnostic?:OpsDiagnostic) {
  diagnostic?.enter('auth_safe_sql');
  const [result] = await query<{ safe: boolean }>(`SELECT
    NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole
    AND NOT pg_has_role(current_user,'feline_auth_owner','MEMBER')
    AND NOT has_schema_privilege(current_user,'public','CREATE')
    AND NOT has_table_privilege(current_user,'public.users','INSERT,DELETE')
    AND NOT has_column_privilege(current_user,'public.users','authMode','UPDATE')
    AND NOT has_column_privilege(current_user,'public.users','authVersion','UPDATE')
    AND NOT has_column_privilege(current_user,'public.users','password','UPDATE')
    AND NOT has_table_privilege(current_user,'public.feline_auth_session','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege(current_user,'public.feline_auth_identity','INSERT,DELETE')
    AND has_function_privilege(current_user,'public.complete_legacy_binding(jsonb)','EXECUTE')
    AND has_function_privilege(current_user,'public.logout_browser(uuid,integer)','EXECUTE')
    AND (SELECT count(*)=5 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('feline_auth_identity','feline_auth_session','feline_auth_browser','feline_auth_flow','feline_auth_rate') AND c.relrowsecurity AND NOT pg_has_role(current_user,c.relowner,'MEMBER'))
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN pg_roles actor WHERE actor.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
      AND c.relname IN ('users','feline_auth_identity','feline_auth_session','feline_auth_browser','feline_auth_flow','feline_auth_rate')
      AND (has_table_privilege(actor.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(actor.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    AND NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
      CROSS JOIN pg_roles actor WHERE actor.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
      AND f.proname IN ('feline_auth_complete','complete_legacy_binding','complete_new_profile','complete_center_login','logout_browser','commit_legacy_login','revoke_local_session','cleanup_auth_rows','cleanup_auth_rows_at','feline_auth_guard_user','feline_auth_guard_flow')
      AND has_function_privilege(actor.oid,f.oid,'EXECUTE'))
    AS safe FROM pg_roles r WHERE r.rolname=current_user`).catch(error=>{diagnostic?.reject('database_unavailable');throw error;});
  if (result?.safe !== true) {diagnostic?.reject('privilege_check_failed');throw new AuthError("AUTH_STORAGE_NOT_READY", 503);}
  if ((process.env.VERCEL === "1" || process.env.APP_ENV === "production" || process.env.OPS_STATUS_READ_SECRET) && !await opsReady(diagnostic)) throw new AuthError("AUTH_STORAGE_NOT_READY", 503);
}
