-- Only for the authorized isolated development instance:
-- 127.0.0.1:54331 / feline_blog_sdk_dev, owner blog_sdk_migrator.
-- Run after the registered schema migration, through the strict local launcher.
-- This file creates no login, changes no passwords and activates no business state.
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'feline_blog_sdk_dev' OR session_user<>'blog_sdk_migrator'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='blog_sdk_runtime'
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
       AND NOT rolinherit AND NOT rolreplication)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
       AND NOT rolinherit AND NOT rolreplication)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
       ON r.oid=m.member WHERE r.rolname IN ('blog_sdk_runtime','blog_sdk_migrator')) THEN
    RAISE EXCEPTION 'SDK_LOCAL_ACL_TARGET_REJECTED';
  END IF;
END $guard$;

-- Remove defaults and stale grants before granting this backend its actual needs.
REVOKE ALL ON ALL TABLES IN SCHEMA public,auth_ops FROM blog_sdk_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public,auth_ops FROM blog_sdk_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,auth_ops FROM blog_sdk_runtime;
GRANT USAGE ON SCHEMA public,auth_ops TO blog_sdk_runtime;
GRANT USAGE ON TYPE public."Role",public."PomodoroType",public."PomodoroEndReason" TO blog_sdk_runtime;

-- Prisma supplies model defaults on INSERT; the trigger enforces USER/sdk/null password.
GRANT SELECT,INSERT ON public.users TO blog_sdk_runtime;
GRANT UPDATE (email,name,"emailVerified",image,"updatedAt","updateAt",username,
  avatar,phone,work,"profileCompletedAt","profileEmailSnapshot","profileEmailConfirmedAt",
  "businessCreatedAt","businessUpdatedAt") ON public.users TO blog_sdk_runtime;
CREATE POLICY sdk_runtime_select ON public.users FOR SELECT TO blog_sdk_runtime USING (true);
CREATE POLICY sdk_runtime_insert ON public.users FOR INSERT TO blog_sdk_runtime
  WITH CHECK (role='USER' AND "authMode"='sdk' AND password IS NULL);
CREATE POLICY sdk_runtime_update ON public.users FOR UPDATE TO blog_sdk_runtime
  USING ("authMode"='sdk') WITH CHECK ("authMode"='sdk' AND password IS NULL);

GRANT SELECT,INSERT,DELETE ON public.sessions TO blog_sdk_runtime;
GRANT SELECT,INSERT,UPDATE ON public.auth_accounts TO blog_sdk_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_verifications TO blog_sdk_runtime;
GRANT SELECT,INSERT,UPDATE ON public.feline_auth_rate TO blog_sdk_runtime;
CREATE POLICY sdk_runtime ON public.sessions TO blog_sdk_runtime USING (true) WITH CHECK (true);
CREATE POLICY sdk_runtime ON public.auth_accounts TO blog_sdk_runtime USING (true) WITH CHECK (true);
CREATE POLICY sdk_runtime ON public.auth_verifications TO blog_sdk_runtime USING (true) WITH CHECK (true);
CREATE POLICY sdk_runtime ON public.feline_auth_rate TO blog_sdk_runtime USING (true) WITH CHECK (true);

-- Trusted server role: business ownership and permissions remain enforced by the host.
GRANT SELECT,INSERT,UPDATE,DELETE ON public."Blog",public."Tag",public."Todo",
  public."TagsOnTodos",public."TagsOnBlogs",public."BlogLike",public."BlogFavorite",
  public."DailyStat",public."WorkoutItem",public."WorkoutSet",public."Exercise",
  public."Prompt",public."PomodoroRecord",public."Checklist",public."ChecklistItem"
  TO blog_sdk_runtime;
DO $sequences$
DECLARE s record;
BEGIN
  FOR s IN SELECT sn.nspname,seq.relname FROM pg_catalog.pg_class seq
    JOIN pg_catalog.pg_namespace sn ON sn.oid=seq.relnamespace
    JOIN pg_catalog.pg_depend d ON d.objid=seq.oid AND d.classid='pg_class'::regclass
    JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
    WHERE seq.relkind='S' AND sn.nspname='public' AND t.relname IN
      ('Blog','Tag','Todo','DailyStat','WorkoutItem','WorkoutSet','Exercise','Prompt') LOOP
    EXECUTE pg_catalog.format('GRANT USAGE,SELECT ON SEQUENCE %I.%I TO blog_sdk_runtime',s.nspname,s.relname);
  END LOOP;
END $sequences$;

GRANT SELECT ON public."AuthInstallState",public."BusinessRestoreRun" TO blog_sdk_runtime;
CREATE POLICY sdk_runtime_read ON public."AuthInstallState" FOR SELECT TO blog_sdk_runtime USING (true);
CREATE POLICY sdk_runtime_read ON public."BusinessRestoreRun" FOR SELECT TO blog_sdk_runtime USING (true);
GRANT EXECUTE ON FUNCTION public.feline_sdk_lock_installation() TO blog_sdk_runtime;
-- The only auth_ops capability is its preexisting sanitized status projection.
GRANT EXECUTE ON FUNCTION auth_ops.cleanup_status() TO blog_sdk_runtime;
-- No legacy sessions, identities, verifications, cleanup, receipt or installation DML.
COMMIT;
