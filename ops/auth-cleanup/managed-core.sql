CREATE OR REPLACE FUNCTION auth_ops.protect_history_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF OLD.history_mode='managed-proxy-v1' AND OLD.cron_job_id IS NOT NULL AND (
  NEW.history_mode IS DISTINCT FROM OLD.history_mode OR NEW.cron_job_id IS DISTINCT FROM OLD.cron_job_id
  OR NEW.activated_at IS DISTINCT FROM OLD.activated_at OR NEW.generation IS DISTINCT FROM OLD.generation
  OR NEW.history_initial_floor IS DISTINCT FROM OLD.history_initial_floor OR NEW.history_prune_floor<OLD.history_prune_floor) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='HISTORY_BINDING_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cleanup_state_history_immutable BEFORE UPDATE ON auth_ops.cleanup_state
 FOR EACH ROW EXECUTE FUNCTION auth_ops.protect_history_state();

CREATE OR REPLACE FUNCTION auth_ops.failure_count() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp AS $$
DECLARE s auth_ops.cleanup_state; registration record; point record; anchor bigint; low_id bigint; high_id bigint;
 since_at timestamptz:=clock_timestamp()-interval '7 days'; history_ok boolean; samples jsonb; sample text; failures integer:=0;
BEGIN
 SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
 SELECT * INTO registration FROM auth_ops.cron_registration();
 IF NOT registration.binding_valid OR registration.code<>'OK' THEN RETURN NULL; END IF;
 high_id:=registration.history_highwater;
 IF high_id<s.history_initial_floor OR high_id<s.history_prune_floor THEN RETURN NULL; END IF;
 SELECT a.cron_run_id INTO anchor FROM auth_ops.cleanup_run a
  WHERE a.job_name=s.job_name AND a.result_code IN ('complete','pending') AND a.finished_at>=since_at
  ORDER BY a.cron_run_id DESC LIMIT 1;
 IF anchor IS NOT NULL THEN
  SELECT * INTO point FROM auth_ops.cron_history_range(anchor,anchor);
  IF NOT FOUND OR point.code<>'OK' OR point.run_id IS DISTINCT FROM anchor THEN RETURN NULL; END IF;
  low_id:=anchor;
 ELSE low_id:=s.history_initial_floor+1;
 END IF;
 IF high_id<low_id THEN
  IF anchor IS NULL AND high_id=s.history_initial_floor AND NOT EXISTS(
   SELECT 1 FROM auth_ops.cleanup_run a WHERE a.job_name=s.job_name AND a.finished_at>=since_at) THEN RETURN 0; END IF;
  RETURN NULL;
 END IF;
 IF high_id-low_id>=16384 THEN RETURN NULL; END IF;
 WITH history AS MATERIALIZED (SELECT * FROM auth_ops.cron_history_range(low_id,high_id)),
 attempts AS MATERIALIZED (
  SELECT h.run_id,COALESCE(a.result_code,CASE WHEN h.source_state='failed' THEN 'error' ELSE NULL END) AS result,
   COALESCE(a.finished_at,h.started_at,h.ended_at) AS happened_at
  FROM history h LEFT JOIN auth_ops.cleanup_run a ON a.job_name=s.job_name AND a.cron_run_id=h.run_id
  WHERE h.code='OK'
 ), recent AS MATERIALIZED (
  SELECT run_id,result FROM attempts WHERE happened_at>=since_at AND result IS NOT NULL ORDER BY run_id DESC LIMIT 3
 )
 SELECT NOT EXISTS(SELECT 1 FROM history WHERE code NOT IN ('OK','EMPTY'))
   AND NOT EXISTS(SELECT 1 FROM auth_ops.cleanup_run a WHERE a.job_name=s.job_name AND a.finished_at>=since_at AND a.cron_run_id>=low_id
    AND NOT EXISTS(SELECT 1 FROM history h WHERE h.code='OK' AND h.run_id=a.cron_run_id)),
  COALESCE((SELECT jsonb_agg(result ORDER BY run_id DESC) FROM recent),'[]'::jsonb)
 INTO history_ok,samples;
 IF NOT history_ok THEN RETURN NULL; END IF;
 FOR sample IN SELECT jsonb_array_elements_text(samples) LOOP
  IF sample IN ('complete','pending') THEN EXIT; END IF;
  IF sample NOT IN ('stalled','error') THEN RETURN NULL; END IF;
  failures:=failures+1;
 END LOOP;
 RETURN least(failures,3);
END $$;

CREATE OR REPLACE FUNCTION auth_ops.cleanup_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp AS $$
DECLARE s auth_ops.cleanup_state; registration record; result jsonb; latest auth_ops.cleanup_run;
 now_at timestamptz:=clock_timestamp(); failures integer;
BEGIN
 SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
 SELECT * INTO registration FROM auth_ops.cron_registration();
 IF NOT registration.binding_valid OR registration.code<>'OK' THEN RAISE EXCEPTION 'OPS_UNAVAILABLE'; END IF;
 failures:=auth_ops.failure_count();
 IF failures IS NULL OR s.history_next_expiry<now_at-interval '24 hours' THEN RAISE EXCEPTION 'OPS_UNAVAILABLE'; END IF;
 SELECT * INTO latest FROM auth_ops.cleanup_run WHERE job_name=s.job_name ORDER BY tick_minute DESC LIMIT 1;
 result:=auth_ops.cleanup_eligible(now_at);
 RETURN jsonb_build_object('adapterVersion','managed-proxy-v1','generation',s.generation,'observedAt',now_at,
  'activatedAt',s.activated_at,'lastCompletedAt',s.last_completed_at,'consecutiveFailures',failures,
  'pending',s.last_result='pending' OR COALESCE((result->>'pending')::boolean,true) OR s.history_prune_upper IS NOT NULL OR COALESCE(s.history_next_expiry<now_at,false)
   OR EXISTS(SELECT 1 FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND finished_at<now_at-interval '7 days'),
  'oldestEligibleExpiry',result->'oldestEligibleExpiry','eligibleCount',result->'eligibleCount','lastTickRef',latest.cron_run_id::text);
END $$;

CREATE OR REPLACE FUNCTION auth_ops.cleanup_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path=pg_catalog,pg_temp AS $$
DECLARE s auth_ops.cleanup_state; started timestamptz:=clock_timestamp(); minute_at timestamptz:=date_trunc('minute',started);
 current_run record; page record; run_id bigint; part jsonb; entry record; counts jsonb:='{}';
 batches integer:=0; removed_runs integer:=0; removed_cron integer:=0; total bigint:=0; failures integer;
 pending boolean:=true; result text:='pending'; history_progress boolean:=false; sweep_done boolean:=false;
 finished_sweep boolean:=false; coverage_current boolean:=true; completed_cutoff timestamptz;
BEGIN
 IF session_user<>'auth_cleanup_scheduler' THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF NOT pg_try_advisory_xact_lock(1639257021,1) THEN RETURN jsonb_build_object('result','skipped'); END IF;
 SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup' FOR UPDATE;
 IF s.history_mode<>'managed-proxy-v1' OR s.cron_job_id IS NULL OR s.activated_at IS NULL OR s.next_due_at>started THEN
  RETURN jsonb_build_object('result','skipped');
 END IF;
 FOR lookup IN 1..50 LOOP
  SELECT * INTO current_run FROM auth_ops.cron_current_run();
  EXIT WHEN current_run.code<>'RUN_NOT_VISIBLE';
  IF lookup<50 THEN PERFORM pg_sleep(0.01); END IF;
 END LOOP;
 IF NOT current_run.binding_valid OR current_run.code<>'OK' OR current_run.run_id IS NULL THEN
  RAISE EXCEPTION USING MESSAGE=COALESCE(current_run.code,'HISTORY_INCOMPLETE');
 END IF;
 run_id:=current_run.run_id;
 IF run_id<=s.history_initial_floor OR run_id<=s.history_prune_floor THEN RAISE EXCEPTION 'HISTORY_INCOMPLETE'; END IF;
 IF EXISTS(SELECT 1 FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND tick_minute=minute_at) THEN RETURN jsonb_build_object('result','skipped'); END IF;
 WHILE batches<500 AND clock_timestamp()<started+interval '25 seconds' LOOP
  history_progress:=false;finished_sweep:=false;removed_runs:=0;removed_cron:=0;
  BEGIN
   part:=auth_ops.cleanup_batch(100,started);
   DELETE FROM auth_ops.cleanup_run WHERE (job_name,tick_minute) IN (
    SELECT job_name,tick_minute FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND finished_at<started-interval '7 days'
    ORDER BY finished_at LIMIT 100 FOR UPDATE SKIP LOCKED);
   GET DIAGNOSTICS removed_runs=ROW_COUNT;
   SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
   IF s.history_prune_upper IS NULL AND NOT sweep_done THEN
    UPDATE auth_ops.cleanup_state SET history_prune_cursor=history_prune_floor,history_prune_upper=run_id-1,
     history_prune_keep_from=NULL,history_prune_cutoff=started,history_prune_next_expiry=NULL WHERE job_name=s.job_name;
    SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
   END IF;
   IF s.history_prune_upper IS NOT NULL THEN
    IF s.history_prune_cursor<s.history_prune_upper THEN
     SELECT * INTO page FROM auth_ops.cron_prune_range(s.history_prune_cursor+1,least(s.history_prune_cursor+100,s.history_prune_upper));
     IF NOT page.binding_valid OR page.code NOT IN ('OK','EMPTY') OR page.checked_high IS NULL OR page.deleted_count IS NULL THEN
      RAISE EXCEPTION USING MESSAGE=COALESCE(page.code,'HISTORY_INCOMPLETE');
     END IF;
     removed_cron:=page.deleted_count;
     UPDATE auth_ops.cleanup_state SET history_prune_cursor=page.checked_high,
      history_prune_keep_from=least(history_prune_keep_from,page.first_retained_runid),
      history_prune_next_expiry=least(history_prune_next_expiry,page.oldest_retained_expiry) WHERE job_name=s.job_name;
     history_progress:=true;
     SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
    END IF;
    IF s.history_prune_cursor=s.history_prune_upper THEN
     completed_cutoff:=s.history_prune_cutoff;
     UPDATE auth_ops.cleanup_state SET history_prune_floor=COALESCE(history_prune_keep_from-1,history_prune_upper),
      history_prune_cursor=COALESCE(history_prune_keep_from-1,history_prune_upper),history_next_expiry=history_prune_next_expiry,
      history_prune_upper=NULL,history_prune_keep_from=NULL,history_prune_cutoff=NULL,history_prune_next_expiry=NULL WHERE job_name=s.job_name;
     finished_sweep:=true;
     -- Later runs outside a sweep older than retention may themselves have expired.
     -- Only a fresh sweep can prove their coverage, even if the old window was empty.
     coverage_current:=completed_cutoff>=started-interval '7 days';
     SELECT * INTO STRICT s FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup';
    END IF;
   END IF;
   pending:=COALESCE((part->>'pending')::boolean,true) OR s.history_prune_upper IS NOT NULL
    OR COALESCE(s.history_next_expiry<started,false) OR NOT coverage_current
    OR EXISTS(SELECT 1 FROM auth_ops.cleanup_run WHERE job_name=s.job_name AND finished_at<started-interval '7 days');
   part:=part||jsonb_build_object('pending',pending,'removedCounts',(part->'removedCounts')||jsonb_build_object('runs',removed_runs,'cronRuns',removed_cron));
   FOR entry IN SELECT key,value FROM jsonb_each_text(part->'removedCounts') LOOP
    IF entry.value::bigint<0 THEN RAISE EXCEPTION 'CLEANUP_COUNTS_INVALID'; END IF;
   END LOOP;
  EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE IN ('40001','40P01','42501') OR SQLERRM IN ('HISTORY_INVALID','HISTORY_INCOMPLETE','SNAPSHOT_INVALID','JOB_INVALID','MODE_INVALID','SESSION_INVALID','NOT_ACTIVE','RANGE_INVALID','RUN_NOT_VISIBLE','RUN_AMBIGUOUS') THEN RAISE; END IF;
   result:='error';pending:=true;EXIT;
  END;
  batches:=batches+1;
  sweep_done:=sweep_done OR finished_sweep;
  FOR entry IN SELECT key,value FROM jsonb_each_text(part->'removedCounts') LOOP
   counts:=jsonb_set(counts,ARRAY[entry.key],to_jsonb(COALESCE((counts->>entry.key)::bigint,0)+entry.value::bigint));
  END LOOP;
  IF NOT pending THEN result:='complete';EXIT; END IF;
  IF sweep_done AND (NOT coverage_current OR COALESCE(s.history_next_expiry<started,false)) THEN result:='pending';EXIT; END IF;
  SELECT COALESCE(sum(value::bigint),0) INTO total FROM jsonb_each_text(part->'removedCounts');
  IF total=0 AND NOT history_progress THEN
   result:='stalled';
   EXIT;
  END IF;
 END LOOP;
 IF batches=0 AND result='pending' THEN result:='stalled'; END IF;
 INSERT INTO auth_ops.cleanup_run(job_name,tick_minute,cron_run_id,started_at,finished_at,removed_counts,batches,pending,result_code)
 VALUES(s.job_name,minute_at,run_id,started,clock_timestamp(),counts,batches,pending,result);
 failures:=auth_ops.failure_count();
 UPDATE auth_ops.cleanup_state SET last_attempt_at=started,last_result=result,
  last_completed_at=CASE WHEN result='complete' THEN clock_timestamp() ELSE last_completed_at END,
  next_due_at=minute_at+CASE WHEN result='complete' THEN interval '5 minutes' ELSE interval '1 minute' END,
  consecutive_failures=COALESCE(failures,consecutive_failures) WHERE job_name=s.job_name;
 RETURN jsonb_build_object('result',result,'batches',batches,'pending',pending,'removedCounts',counts);
END $$;
