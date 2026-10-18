-- __RUNTIME__ is validated as an identifier before substitution.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='auth_ops_owner') THEN
  CREATE ROLE auth_ops_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='auth_cleanup_scheduler') THEN
  CREATE ROLE auth_cleanup_scheduler NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('auth_ops_owner','auth_cleanup_scheduler') AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='auth_ops_owner' AND rolcanlogin)
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='__RUNTIME__' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
  OR pg_has_role('__RUNTIME__','auth_ops_owner','MEMBER') OR pg_has_role('__RUNTIME__','auth_cleanup_scheduler','MEMBER') THEN
  RAISE EXCEPTION 'OPS_ROLE_INVALID';
 END IF;
END $$;
ALTER SCHEMA auth_ops OWNER TO auth_ops_owner;
ALTER TABLE auth_ops.cleanup_state OWNER TO auth_ops_owner;
ALTER TABLE auth_ops.cleanup_run OWNER TO auth_ops_owner;
DO $$ DECLARE f record; r text; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth_ops' LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO auth_ops_owner',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,__RUNTIME__,auth_cleanup_scheduler',f.signature);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role','__RUNTIME__','auth_cleanup_scheduler'] LOOP
  IF r='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA auth_ops FROM %s',CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA auth_ops FROM %s',CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
   EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_ops FROM %s',CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
  END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA auth_ops TO __RUNTIME__,auth_cleanup_scheduler;
GRANT EXECUTE ON FUNCTION auth_ops.cleanup_status() TO __RUNTIME__;
GRANT EXECUTE ON FUNCTION auth_ops.cleanup_tick() TO auth_cleanup_scheduler;
-- pg_cron installs PUBLIC function EXECUTE even when schema usage is restricted.
-- Remove this inherited management path before granting the scheduler schema usage.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA cron FROM PUBLIC,__RUNTIME__,auth_cleanup_scheduler;
GRANT USAGE ON SCHEMA cron TO auth_ops_owner;
GRANT SELECT ON cron.job TO auth_ops_owner;
GRANT SELECT,DELETE ON cron.job_run_details TO auth_ops_owner;
CREATE INDEX IF NOT EXISTS auth_ops_history_lookup_idx ON cron.job_run_details(jobid,job_pid,status);
CREATE INDEX IF NOT EXISTS auth_ops_history_order_idx ON cron.job_run_details(jobid,runid DESC);
CREATE INDEX IF NOT EXISTS auth_ops_history_retention_idx ON cron.job_run_details(jobid,end_time);
DROP POLICY IF EXISTS auth_ops_own_job ON cron.job;
CREATE POLICY auth_ops_own_job ON cron.job TO auth_ops_owner
 USING(jobid=(SELECT cron_job_id FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'));
DROP POLICY IF EXISTS auth_ops_own_run ON cron.job_run_details;
CREATE POLICY auth_ops_own_run ON cron.job_run_details TO auth_ops_owner
 USING(jobid=(SELECT cron_job_id FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'));
ALTER ROLE auth_cleanup_scheduler SET statement_timeout='30s';
ALTER ROLE auth_cleanup_scheduler SET lock_timeout='1s';
ALTER DEFAULT PRIVILEGES FOR ROLE auth_ops_owner IN SCHEMA auth_ops REVOKE ALL ON TABLES FROM PUBLIC;
-- Global defaults must remove PostgreSQL's built-in PUBLIC EXECUTE; schema defaults only add grants.
ALTER DEFAULT PRIVILEGES FOR ROLE auth_ops_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE auth_ops_owner IN SCHEMA auth_ops REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
