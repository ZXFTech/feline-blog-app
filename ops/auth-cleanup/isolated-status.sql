DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth_ops.cleanup_state WHERE history_mode NOT IN ('disabled','isolated-direct-v1')) THEN
  RAISE EXCEPTION 'ISOLATED_MODE_CONFLICT';
 END IF;
 UPDATE auth_ops.cleanup_state SET history_mode='isolated-direct-v1' WHERE job_name='auth-cleanup';
 IF to_regprocedure('auth_ops.isolated_cleanup_status()') IS NULL THEN
  ALTER FUNCTION auth_ops.cleanup_status() RENAME TO isolated_cleanup_status;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION auth_ops.cleanup_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth_ops.cleanup_state s JOIN cron.job j ON j.jobid=s.cron_job_id
  WHERE s.job_name='auth-cleanup' AND s.history_mode='isolated-direct-v1' AND j.active
   AND j.jobname='auth-cleanup' AND j.username='auth_cleanup_scheduler' AND j.database=current_database()
   AND j.command='SELECT auth_ops.cleanup_tick()' AND j.schedule='* * * * *') THEN RAISE EXCEPTION 'OPS_UNAVAILABLE'; END IF;
 RETURN auth_ops.isolated_cleanup_status() || jsonb_build_object('adapterVersion','isolated-direct-v1');
END $$;
ALTER FUNCTION auth_ops.cleanup_status() OWNER TO auth_ops_owner;
REVOKE ALL ON FUNCTION auth_ops.cleanup_status(),auth_ops.isolated_cleanup_status() FROM PUBLIC,anon,authenticated,service_role,__RUNTIME__,auth_cleanup_scheduler;
GRANT EXECUTE ON FUNCTION auth_ops.cleanup_status() TO __RUNTIME__;
