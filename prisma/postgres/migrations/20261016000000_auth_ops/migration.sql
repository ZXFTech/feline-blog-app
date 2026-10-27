-- Auth operations are inactive until a separately authorized installation binds a real Cron job.
CREATE SCHEMA IF NOT EXISTS auth_ops;
REVOKE ALL ON SCHEMA auth_ops FROM PUBLIC;
CREATE TABLE auth_ops.cleanup_state (
 job_name text PRIMARY KEY CHECK(job_name='auth-cleanup'),
 cron_job_id bigint, activated_at timestamptz,
 next_due_at timestamptz NOT NULL DEFAULT date_trunc('minute',clock_timestamp()),
 last_attempt_at timestamptz, last_completed_at timestamptz,
 consecutive_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_failures BETWEEN 0 AND 3),
 last_result text NOT NULL DEFAULT 'disabled' CHECK(last_result IN ('disabled','complete','pending','stalled','error')),
 generation uuid NOT NULL DEFAULT gen_random_uuid(),
 CHECK((cron_job_id IS NULL)=(activated_at IS NULL))
);
CREATE TABLE auth_ops.cleanup_run (
 job_name text NOT NULL REFERENCES auth_ops.cleanup_state(job_name),
 tick_minute timestamptz NOT NULL, cron_run_id bigint NOT NULL,
 started_at timestamptz NOT NULL, finished_at timestamptz NOT NULL,
 removed_counts jsonb NOT NULL CHECK(jsonb_typeof(removed_counts)='object'),
 batches integer NOT NULL CHECK(batches BETWEEN 0 AND 500), pending boolean NOT NULL,
 result_code text NOT NULL CHECK(result_code IN ('complete','pending','stalled','error')),
 PRIMARY KEY(job_name,tick_minute), UNIQUE(job_name,cron_run_id),
 CHECK(finished_at>=started_at)
);
CREATE INDEX cleanup_run_retention_idx ON auth_ops.cleanup_run(finished_at);
ALTER TABLE auth_ops.cleanup_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_ops.cleanup_run ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA auth_ops FROM PUBLIC;
INSERT INTO auth_ops.cleanup_state(job_name) VALUES('auth-cleanup');

CREATE FUNCTION auth_ops.failure_count() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j bigint; r record; failures integer:=0;
BEGIN
 SELECT cron_job_id INTO j FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
 IF j IS NULL THEN RETURN 0; END IF;
 IF EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=j
    AND start_time>=clock_timestamp()-interval '7 days'
    AND (status NOT IN ('starting','connecting','sending','running','succeeded','failed') OR
      command<>'SELECT auth_ops.cleanup_tick()' OR database<>current_database() OR username<>'auth_cleanup_scheduler')) THEN
  RAISE EXCEPTION 'CLEANUP_HISTORY_INVALID';
 END IF;
 FOR r IN SELECT COALESCE(a.result_code,'error') AS result
   FROM cron.job_run_details h LEFT JOIN auth_ops.cleanup_run a
     ON a.job_name='auth-cleanup' AND a.cron_run_id=h.runid
   WHERE h.jobid=j AND h.start_time>=clock_timestamp()-interval '7 days'
     AND (a.cron_run_id IS NOT NULL OR h.status='failed')
   ORDER BY h.runid DESC LIMIT 3 LOOP
  IF r.result IN ('complete','pending') THEN EXIT; END IF;
  failures:=failures+1;
 END LOOP;
 RETURN failures;
END $$;

CREATE FUNCTION auth_ops.cleanup_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s auth_ops.cleanup_state; started timestamptz:=clock_timestamp();
 cutoff timestamptz:=started; minute_at timestamptz:=date_trunc('minute',started);
 run_id bigint; matches integer; part jsonb; counts jsonb:='{}'; entry record;
 batches integer:=0; total bigint:=0; pending boolean:=true; result text:='pending';
 removed_runs integer:=0; removed_cron integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(1639257021,1) THEN RETURN jsonb_build_object('result','skipped'); END IF;
 SELECT * INTO s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup' FOR UPDATE;
 IF s.cron_job_id IS NULL OR s.activated_at IS NULL OR s.next_due_at>started THEN RETURN jsonb_build_object('result','skipped'); END IF;
 -- Wait briefly for the launcher's committed row for this exact backend.
 FOR lookup IN 1..50 LOOP
  SELECT count(*),min(runid) INTO matches,run_id FROM cron.job_run_details
   WHERE jobid=s.cron_job_id AND job_pid=pg_backend_pid() AND status='running';
  EXIT WHEN matches<>0;
  PERFORM pg_sleep(0.01);
 END LOOP;
 IF matches<>1 THEN RAISE EXCEPTION 'CLEANUP_RUN_ID_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND tick_minute=minute_at) THEN
  RETURN jsonb_build_object('result','skipped');
 END IF;
 WHILE batches<500 AND clock_timestamp()<started+interval '25 seconds' LOOP
  BEGIN
   part:=auth_ops.cleanup_batch(100,cutoff);
   DELETE FROM auth_ops.cleanup_run WHERE (job_name,tick_minute) IN
    (SELECT job_name,tick_minute FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND finished_at<cutoff-interval '7 days' ORDER BY finished_at LIMIT 100 FOR UPDATE SKIP LOCKED);
   GET DIAGNOSTICS removed_runs=ROW_COUNT;
   DELETE FROM cron.job_run_details WHERE runid IN
    (SELECT runid FROM cron.job_run_details WHERE jobid=s.cron_job_id AND end_time<cutoff-interval '7 days' ORDER BY runid LIMIT 100);
   GET DIAGNOSTICS removed_cron=ROW_COUNT;
   pending:=(part->>'pending')::boolean OR EXISTS(SELECT 1 FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND finished_at<cutoff-interval '7 days')
    OR EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=s.cron_job_id AND end_time<cutoff-interval '7 days');
   part:=part||jsonb_build_object('pending',pending,'removedCounts',(part->'removedCounts')||jsonb_build_object('runs',removed_runs,'cronRuns',removed_cron));
  EXCEPTION WHEN OTHERS THEN
   result:='error'; EXIT;
  END;
  batches:=batches+1;
  FOR entry IN SELECT key,value FROM jsonb_each_text(part->'removedCounts') LOOP
   IF entry.value::bigint<0 THEN RAISE EXCEPTION 'CLEANUP_COUNTS_INVALID'; END IF;
   counts:=jsonb_set(counts,ARRAY[entry.key],to_jsonb(COALESCE((counts->>entry.key)::bigint,0)+entry.value::bigint));
  END LOOP;
  pending:=(part->>'pending')::boolean;
  IF NOT pending THEN result:='complete'; EXIT; END IF;
  SELECT COALESCE(sum(value::bigint),0) INTO total FROM jsonb_each_text(part->'removedCounts');
  IF total=0 THEN result:='stalled'; EXIT; END IF;
 END LOOP;
 INSERT INTO auth_ops.cleanup_run(job_name,tick_minute,cron_run_id,started_at,finished_at,removed_counts,batches,pending,result_code)
 VALUES(s.job_name,minute_at,run_id,started,clock_timestamp(),counts,batches,pending,result);
 UPDATE auth_ops.cleanup_state SET last_attempt_at=started,last_result=result,
  last_completed_at=CASE WHEN result='complete' THEN clock_timestamp() ELSE last_completed_at END,
  next_due_at=minute_at+CASE WHEN result='complete' THEN interval '5 minutes' ELSE interval '1 minute' END,
  consecutive_failures=auth_ops.failure_count() WHERE job_name=s.job_name;
 RETURN jsonb_build_object('result',result,'batches',batches,'pending',pending,'removedCounts',counts);
END $$;

CREATE FUNCTION auth_ops.cleanup_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s auth_ops.cleanup_state; result jsonb; latest auth_ops.cleanup_run; now_at timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
 IF s.cron_job_id IS NULL OR s.activated_at IS NULL THEN RAISE EXCEPTION 'CLEANUP_NOT_ACTIVE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=s.cron_job_id AND active AND jobname='auth-cleanup' AND schedule='* * * * *'
   AND username='auth_cleanup_scheduler' AND database=current_database() AND command='SELECT auth_ops.cleanup_tick()') THEN RAISE EXCEPTION 'CLEANUP_JOB_INVALID'; END IF;
 SELECT * INTO latest FROM auth_ops.cleanup_run WHERE job_name=s.job_name ORDER BY tick_minute DESC LIMIT 1;
 result:=auth_ops.cleanup_eligible(now_at);
 RETURN jsonb_build_object('generation',s.generation,'observedAt',now_at,
  'activatedAt',s.activated_at,'lastCompletedAt',s.last_completed_at,
  'consecutiveFailures',auth_ops.failure_count(),'pending',COALESCE((result->>'pending')::boolean,true) OR EXISTS(SELECT 1 FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND finished_at<now_at-interval '7 days') OR EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=s.cron_job_id AND end_time<now_at-interval '7 days'),
  'oldestEligibleExpiry',result->'oldestEligibleExpiry','eligibleCount',result->'eligibleCount',
  'lastTickRef',latest.cron_run_id::text);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_ops FROM PUBLIC;
CREATE FUNCTION public.cleanup_auth_rows_at(batch integer, cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.feline_auth_browser; ids uuid[];
 flows integer:=0; sessions integer:=0; browsers integer:=0; rates integer:=0; removed integer; pending boolean;
BEGIN
 IF cutoff IS NULL OR batch IS NULL OR batch<1 OR batch>1000 THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
 FOR b IN SELECT * FROM public.feline_auth_browser target
  WHERE EXISTS(SELECT 1 FROM public.feline_auth_flow f WHERE f.browser_state_id=target.id AND (f.expires_at<=cutoff OR f.status IN ('consumed','cancelled','replaced','expired','failed')))
   OR EXISTS(SELECT 1 FROM public.feline_auth_session s WHERE s.browser_state_id=target.id AND (s.expires_at<=cutoff OR s.revoked_at IS NOT NULL))
   OR (target.expires_at<=cutoff AND NOT EXISTS(SELECT 1 FROM public.feline_auth_flow f WHERE f.browser_state_id=target.id) AND NOT EXISTS(SELECT 1 FROM public.feline_auth_session s WHERE s.browser_state_id=target.id))
  ORDER BY target.id LIMIT batch FOR UPDATE SKIP LOCKED LOOP
  SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.feline_auth_flow WHERE browser_state_id=b.id AND (expires_at<=cutoff OR status IN ('consumed','cancelled','replaced','expired','failed')) ORDER BY expires_at,id LIMIT batch) f;
  UPDATE public.feline_auth_browser SET current_flow_id=NULL WHERE id=b.id AND current_flow_id=ANY(ids);
  DELETE FROM public.feline_auth_flow WHERE id=ANY(ids);
  GET DIAGNOSTICS removed=ROW_COUNT; flows:=flows+removed;
  DELETE FROM public.feline_auth_session WHERE id IN (SELECT id FROM public.feline_auth_session WHERE browser_state_id=b.id AND (expires_at<=cutoff OR revoked_at IS NOT NULL) ORDER BY expires_at,id LIMIT batch);
  GET DIAGNOSTICS removed=ROW_COUNT; sessions:=sessions+removed;
  DELETE FROM public.feline_auth_browser WHERE id=b.id AND expires_at<=cutoff AND current_flow_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.feline_auth_flow WHERE browser_state_id=b.id) AND NOT EXISTS(SELECT 1 FROM public.feline_auth_session WHERE browser_state_id=b.id);
  GET DIAGNOSTICS removed=ROW_COUNT; browsers:=browsers+removed;
 END LOOP;
 DELETE FROM public.feline_auth_rate WHERE (key_hash,operation,window_start) IN (SELECT key_hash,operation,window_start FROM public.feline_auth_rate WHERE expires_at<=cutoff ORDER BY expires_at,key_hash,operation,window_start LIMIT batch FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS rates=ROW_COUNT;
 SELECT EXISTS(SELECT 1 FROM public.feline_auth_flow WHERE expires_at<=cutoff OR status IN ('consumed','cancelled','replaced','expired','failed'))
  OR EXISTS(SELECT 1 FROM public.feline_auth_session WHERE expires_at<=cutoff OR revoked_at IS NOT NULL)
  OR EXISTS(SELECT 1 FROM public.feline_auth_rate WHERE expires_at<=cutoff)
  OR EXISTS(SELECT 1 FROM public.feline_auth_browser target WHERE target.expires_at<=cutoff AND NOT EXISTS(SELECT 1 FROM public.feline_auth_flow f WHERE f.browser_state_id=target.id) AND NOT EXISTS(SELECT 1 FROM public.feline_auth_session s WHERE s.browser_state_id=target.id)) INTO pending;
 RETURN jsonb_build_object('flows',flows,'sessions',sessions,'browsers',browsers,'rates',rates,'pending',pending);
END $$;
CREATE OR REPLACE FUNCTION public.cleanup_auth_rows(batch integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN public.cleanup_auth_rows_at(batch,clock_timestamp()); END $$;
REVOKE ALL ON FUNCTION public.cleanup_auth_rows_at(integer,timestamptz),public.cleanup_auth_rows(integer) FROM PUBLIC;
CREATE FUNCTION auth_ops.cleanup_eligible(cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE oldest timestamptz; eligible bigint;
BEGIN
 SELECT min(expiry),count(*) INTO oldest,eligible FROM (
  SELECT CASE WHEN expires_at<=cutoff THEN expires_at ELSE created_at END AS expiry FROM public.feline_auth_flow WHERE expires_at<=cutoff OR status IN ('consumed','cancelled','replaced','expired','failed')
  UNION ALL SELECT LEAST(expires_at,COALESCE(revoked_at,expires_at)) FROM public.feline_auth_session WHERE expires_at<=cutoff OR revoked_at IS NOT NULL
  UNION ALL SELECT target.expires_at FROM public.feline_auth_browser target WHERE target.expires_at<=cutoff AND NOT EXISTS(SELECT 1 FROM public.feline_auth_flow f WHERE f.browser_state_id=target.id) AND NOT EXISTS(SELECT 1 FROM public.feline_auth_session s WHERE s.browser_state_id=target.id)
  UNION ALL SELECT expires_at FROM public.feline_auth_rate WHERE expires_at<=cutoff
 ) eligible_rows;
 RETURN jsonb_build_object('pending',eligible>0,'oldestEligibleExpiry',oldest,'eligibleCount',eligible);
END $$;
CREATE FUNCTION auth_ops.cleanup_batch(batch integer,cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE part jsonb;
BEGIN
 part:=public.cleanup_auth_rows_at(batch,cutoff);
 RETURN jsonb_build_object('pending',(part->>'pending')::boolean,'removedCounts',jsonb_build_object('flows',(part->>'flows')::bigint,'sessions',(part->>'sessions')::bigint,'browsers',(part->>'browsers')::bigint,'rateLimit',(part->>'rates')::bigint));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_ops FROM PUBLIC;
