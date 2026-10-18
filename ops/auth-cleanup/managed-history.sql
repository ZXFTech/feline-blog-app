-- These bodies are parsed at CREATE time. No runtime dynamic SQL or cron USAGE.
CREATE OR REPLACE FUNCTION auth_ops.cron_registration()
RETURNS TABLE(binding_valid boolean,code text,job_id bigint,history_highwater bigint,adapter_version text)
LANGUAGE SQL SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp
BEGIN ATOMIC
 WITH state AS MATERIALIZED (
  SELECT s.history_mode,s.cron_job_id,s.activated_at,j.jobid,j.jobname,j.username,j.database,j.command,j.schedule,j.active
  FROM (VALUES(1)) AS one(n) LEFT JOIN auth_ops.cleanup_state s ON s.job_name='auth-cleanup'
  LEFT JOIN cron.job j ON j.jobid=s.cron_job_id
 ), verdict AS MATERIALIZED (
  SELECT *,CASE
   WHEN pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN 'SNAPSHOT_INVALID'
   WHEN history_mode IS DISTINCT FROM 'managed-proxy-v1' THEN 'MODE_INVALID'
   WHEN cron_job_id IS NULL OR activated_at IS NULL THEN 'NOT_ACTIVE'
   WHEN jobid IS NULL OR jobname IS DISTINCT FROM 'auth-cleanup' OR username IS DISTINCT FROM 'auth_cleanup_scheduler'
    OR database IS DISTINCT FROM pg_catalog.current_database() OR command IS DISTINCT FROM 'SELECT auth_ops.cleanup_tick()'
    OR schedule IS DISTINCT FROM '* * * * *' THEN 'JOB_INVALID'
   WHEN active IS DISTINCT FROM true THEN 'NOT_ACTIVE' ELSE 'OK' END AS result FROM state
 )
 SELECT result='OK',result,CASE WHEN result='OK' THEN cron_job_id ELSE NULL::bigint END,
  CASE WHEN result='OK' THEN COALESCE((SELECT max(h.runid) FROM cron.job_run_details h),0::bigint) ELSE NULL::bigint END,
  'managed-proxy-v1'::text FROM verdict;
END;

CREATE OR REPLACE FUNCTION auth_ops.cron_current_run()
RETURNS TABLE(binding_valid boolean,code text,match_count integer,run_id bigint)
LANGUAGE SQL SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp
BEGIN ATOMIC
 WITH registration AS MATERIALIZED (SELECT * FROM auth_ops.cron_registration()),
 matches AS MATERIALIZED (
  SELECT h.runid,h.job_pid,h.start_time,h.end_time,h.username,h.database,h.command
  FROM registration r JOIN cron.job_run_details h ON r.binding_valid AND h.jobid=r.job_id
   AND h.runid BETWEEN greatest(1::bigint,r.history_highwater-8191) AND r.history_highwater
  WHERE h.job_pid=pg_catalog.pg_backend_pid() AND h.status='running'
 ), facts AS MATERIALIZED (
  SELECT count(*)::integer AS n,min(runid) AS id,COALESCE(bool_and(
   job_pid>0 AND start_time IS NOT NULL AND pg_catalog.isfinite(start_time) AND end_time IS NULL
   AND start_time<=pg_catalog.clock_timestamp()+interval '120 seconds'
   AND username='auth_cleanup_scheduler' AND database=pg_catalog.current_database() AND command='SELECT auth_ops.cleanup_tick()'),false) AS valid FROM matches
 ), verdict AS MATERIALIZED (
  SELECT r.binding_valid,f.n,f.id,CASE
   WHEN session_user<>'auth_cleanup_scheduler' THEN 'SESSION_INVALID'
   WHEN NOT r.binding_valid THEN r.code
   WHEN f.n=0 THEN 'RUN_NOT_VISIBLE' WHEN f.n>1 THEN 'RUN_AMBIGUOUS'
   WHEN NOT f.valid THEN 'HISTORY_INVALID' ELSE 'OK' END AS result FROM registration r CROSS JOIN facts f
 )
 SELECT binding_valid AND result<>'SESSION_INVALID',result,
  CASE WHEN result IN ('OK','RUN_NOT_VISIBLE','RUN_AMBIGUOUS','HISTORY_INVALID') THEN n ELSE NULL::integer END,
  CASE WHEN result='OK' THEN id ELSE NULL::bigint END FROM verdict;
END;

CREATE OR REPLACE FUNCTION auth_ops.cron_history_range(low bigint,high bigint)
RETURNS TABLE(binding_valid boolean,code text,run_id bigint,source_state text,job_pid integer,started_at timestamptz,ended_at timestamptz,identity_valid boolean)
LANGUAGE SQL SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp
BEGIN ATOMIC
 WITH registration AS MATERIALIZED (SELECT * FROM auth_ops.cron_registration()),
 input AS MATERIALIZED (SELECT *,COALESCE($1>=1 AND $2>=$1 AND $2-$1<16384,false) AS valid_range FROM registration),
 selected AS MATERIALIZED (
  SELECT h.runid,h.status,h.job_pid,h.start_time,h.end_time,
   COALESCE(h.username='auth_cleanup_scheduler' AND h.database=pg_catalog.current_database() AND h.command='SELECT auth_ops.cleanup_tick()',false) AS identity_ok,
   COALESCE(h.status IN ('starting','connecting','sending','running','succeeded','failed')
    AND (h.start_time IS NULL OR (pg_catalog.isfinite(h.start_time) AND h.start_time<=pg_catalog.clock_timestamp()+interval '120 seconds'))
    AND (h.end_time IS NULL OR (pg_catalog.isfinite(h.end_time) AND h.end_time<=pg_catalog.clock_timestamp()+interval '120 seconds'))
    AND (h.start_time IS NULL OR h.end_time IS NULL OR h.end_time>=h.start_time)
    AND (h.job_pid IS NULL OR h.job_pid>0)
    AND CASE WHEN h.status='succeeded' THEN h.start_time IS NOT NULL AND h.end_time IS NOT NULL AND h.job_pid IS NOT NULL
      WHEN h.status='failed' THEN h.end_time IS NOT NULL
      ELSE h.end_time IS NULL AND h.start_time IS NOT NULL AND h.start_time>=pg_catalog.clock_timestamp()-interval '120 seconds' END,false) AS values_ok
  FROM input i JOIN cron.job_run_details h ON i.binding_valid AND i.valid_range AND h.jobid=i.job_id AND h.runid BETWEEN $1 AND $2
 ), facts AS MATERIALIZED (SELECT count(*) AS n,COALESCE(bool_and(identity_ok AND values_ok),true) AS valid_rows FROM selected),
 verdict AS MATERIALIZED (
  SELECT i.binding_valid,CASE WHEN NOT i.binding_valid THEN i.code WHEN NOT i.valid_range THEN 'RANGE_INVALID'
   WHEN NOT f.valid_rows THEN 'HISTORY_INVALID' WHEN f.n=0 THEN 'EMPTY' ELSE 'OK' END AS result FROM input i CROSS JOIN facts f
 )
 SELECT v.binding_valid,v.result,s.runid,s.status,s.job_pid,s.start_time,s.end_time,s.identity_ok
 FROM verdict v JOIN selected s ON v.result='OK'
 UNION ALL
 SELECT v.binding_valid,v.result,NULL::bigint,NULL::text,NULL::integer,NULL::timestamptz,NULL::timestamptz,NULL::boolean FROM verdict v WHERE v.result<>'OK';
END;

CREATE OR REPLACE FUNCTION auth_ops.cron_prune_range(low bigint,high bigint)
RETURNS TABLE(binding_valid boolean,code text,checked_high bigint,deleted_count integer,first_retained_runid bigint,oldest_retained_expiry timestamptz)
LANGUAGE SQL SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp
BEGIN ATOMIC
 WITH registration AS MATERIALIZED (SELECT * FROM auth_ops.cron_registration()),
 input AS MATERIALIZED (
  SELECT r.*,s.history_prune_cutoff,COALESCE(s.history_prune_upper IS NULL OR s.history_prune_upper<r.history_highwater,false) AS complete_history,COALESCE($1>=1 AND $2>=$1 AND $2-$1<100
   AND $1=s.history_prune_cursor+1 AND $2=least(s.history_prune_cursor+100,s.history_prune_upper)
   AND s.history_prune_upper IS NOT NULL AND s.history_prune_cutoff IS NOT NULL
   AND pg_catalog.isfinite(s.history_prune_cutoff) AND s.history_prune_cutoff<=pg_catalog.clock_timestamp(),false) AS valid_range
  FROM registration r CROSS JOIN auth_ops.cleanup_state s WHERE s.job_name='auth-cleanup'
 ), selected AS MATERIALIZED (
  SELECT h.runid,h.jobid,h.status,h.job_pid,h.start_time,h.end_time,h.username,h.database,h.command,
   COALESCE(h.username='auth_cleanup_scheduler' AND h.database=pg_catalog.current_database() AND h.command='SELECT auth_ops.cleanup_tick()'
    AND h.status IN ('succeeded','failed') AND h.end_time IS NOT NULL AND pg_catalog.isfinite(h.end_time)
    AND h.end_time<=pg_catalog.clock_timestamp()+interval '120 seconds'
    AND (h.job_pid IS NULL OR h.job_pid>0)
    AND (h.start_time IS NULL OR (pg_catalog.isfinite(h.start_time) AND h.start_time<=h.end_time))
    AND (h.status<>'succeeded' OR (h.start_time IS NOT NULL AND h.job_pid IS NOT NULL)),false) AS valid_row
  FROM input i JOIN cron.job_run_details h ON i.binding_valid AND i.valid_range AND i.complete_history AND h.jobid=i.job_id AND h.runid BETWEEN $1 AND $2
 ), facts AS MATERIALIZED (SELECT count(*) AS n,COALESCE(bool_and(valid_row),true) AS valid_rows FROM selected),
 verdict AS MATERIALIZED (
  SELECT i.*,CASE WHEN NOT i.binding_valid THEN i.code WHEN NOT i.complete_history THEN 'HISTORY_INCOMPLETE' WHEN NOT i.valid_range THEN 'RANGE_INVALID'
   WHEN NOT f.valid_rows THEN 'HISTORY_INVALID' WHEN f.n=0 THEN 'EMPTY' ELSE 'OK' END AS result FROM input i CROSS JOIN facts f
 ), removed AS (
  DELETE FROM cron.job_run_details h USING selected s,verdict v
  WHERE v.result='OK' AND h.runid=s.runid AND h.jobid=s.jobid
   AND h.status=s.status AND h.username=s.username AND h.database=s.database AND h.command=s.command
   AND h.end_time IS NOT DISTINCT FROM s.end_time AND h.start_time IS NOT DISTINCT FROM s.start_time
   AND h.job_pid IS NOT DISTINCT FROM s.job_pid AND h.end_time<v.history_prune_cutoff-interval '7 days'
  RETURNING h.runid
 ), retained AS MATERIALIZED (SELECT s.runid,s.end_time FROM selected s WHERE NOT EXISTS(SELECT 1 FROM removed d WHERE d.runid=s.runid))
 SELECT v.binding_valid,v.result,CASE WHEN v.result IN ('OK','EMPTY') THEN $2 ELSE NULL::bigint END,
  CASE WHEN v.result IN ('OK','EMPTY') THEN (SELECT count(*)::integer FROM removed) ELSE NULL::integer END,
  CASE WHEN v.result IN ('OK','EMPTY') THEN (SELECT min(s.runid) FROM retained s) ELSE NULL::bigint END,
  CASE WHEN v.result IN ('OK','EMPTY') THEN (SELECT min(s.end_time+interval '7 days') FROM retained s) ELSE NULL::timestamptz END
 FROM verdict v;
END;
