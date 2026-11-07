-- New namespace only. Execute as its dedicated owner in the initial migration.
-- This script does not change public, auth_ops, existing roles or source data.
ALTER TABLE feline_sdk_prod.users ADD CONSTRAINT sdk_profile_complete CHECK (
  "profileCompletedAt" IS NULL OR (
    "profileEmailSnapshot" IS NOT NULL AND "profileEmailConfirmedAt" IS NOT NULL AND
    "businessCreatedAt" IS NOT NULL AND "businessUpdatedAt" IS NOT NULL AND
    char_length(username) BETWEEN 1 AND 64 AND username=btrim(username) AND username !~ '[[:cntrl:]]'));
ALTER TABLE feline_sdk_prod.users ADD CONSTRAINT sdk_auth_mode CHECK (
  ("authMode"='sdk' AND password IS NULL) OR
  ("authMode"='legacy' AND password IS NOT NULL) OR
  ("authMode"='center' AND password IS NULL AND "authVersion">0));
ALTER TABLE feline_sdk_prod."AuthInstallState" ADD CONSTRAINT sdk_install_valid CHECK (
  id='primary' AND revision>=0 AND phase IN ('awaiting_root','awaiting_restore','ready') AND
  (phase='awaiting_root' OR ("rootUserId" IS NOT NULL AND "rootInitializedAt" IS NOT NULL AND
    "rootIssuer" IS NOT NULL AND "rootSubjectDigest" IS NOT NULL AND "bootstrapPlanDigest" IS NOT NULL AND
    "rootSubjectDigest" ~ '^[a-f0-9]{64}$' AND "bootstrapPlanDigest" ~ '^[a-f0-9]{64}$')) AND
  (phase<>'ready' OR ("restoreRunId" IS NOT NULL AND "activatedAt" IS NOT NULL AND
    "activationPlanDigest" IS NOT NULL AND "activationEvidenceSha256" IS NOT NULL AND
    "activationPlanDigest" ~ '^[a-f0-9]{64}$' AND "activationEvidenceRef" IS NOT NULL AND
    "activationEvidenceSha256" ~ '^[a-f0-9]{64}$')));
ALTER TABLE feline_sdk_prod."BusinessRestoreRun" ADD CONSTRAINT sdk_restore_valid CHECK (
  "manifestSha256" ~ '^[a-f0-9]{64}$' AND "planDigest" ~ '^[a-f0-9]{64}$' AND "contentDigest" ~ '^[a-f0-9]{64}$');
INSERT INTO feline_sdk_prod."AuthInstallState" (id,"targetGeneration") VALUES ('primary',gen_random_uuid());

CREATE FUNCTION feline_sdk_prod.feline_sdk_guard_user() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
DECLARE maintenance boolean;
BEGIN
  SELECT pg_catalog.pg_has_role(current_user,c.relowner,'USAGE') INTO maintenance
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='feline_sdk_prod' AND c.relname='users';
  IF NOT coalesce(maintenance,false) THEN
    IF TG_OP='INSERT' AND (NEW.role<>'USER' OR NEW."authMode"<>'sdk' OR NEW.password IS NOT NULL OR NEW."authVersion"<>0) THEN
      RAISE EXCEPTION 'SDK_RUNTIME_USER_INSERT_REJECTED'; END IF;
    IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW."authMode" IS DISTINCT FROM OLD."authMode"
      OR NEW.password IS DISTINCT FROM OLD.password OR NEW."authVersion" IS DISTINCT FROM OLD."authVersion") THEN
      RAISE EXCEPTION 'SDK_RUNTIME_AUTHORITY_CHANGE_REJECTED'; END IF;
    IF TG_OP='DELETE' AND OLD."profileCompletedAt" IS NOT NULL THEN RAISE EXCEPTION 'SDK_COMPLETED_USER_DELETE_REJECTED'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $guard$;
CREATE TRIGGER feline_sdk_guard_user BEFORE INSERT OR UPDATE OR DELETE ON feline_sdk_prod.users
  FOR EACH ROW EXECUTE FUNCTION feline_sdk_prod.feline_sdk_guard_user();
CREATE FUNCTION feline_sdk_prod.feline_sdk_lock_installation() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lock$
BEGIN
  PERFORM id FROM feline_sdk_prod."AuthInstallState" WHERE id='primary' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SDK_INSTALLATION_MISSING'; END IF;
END $lock$;

REVOKE ALL ON SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA feline_sdk_prod FROM anon,authenticated,service_role,blog_sdk_prod_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA feline_sdk_prod FROM anon,authenticated,service_role,blog_sdk_prod_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA feline_sdk_prod FROM anon,authenticated,service_role,blog_sdk_prod_runtime;
GRANT USAGE ON SCHEMA feline_sdk_prod TO blog_sdk_prod_runtime;
GRANT USAGE ON TYPE feline_sdk_prod."Role",feline_sdk_prod."PomodoroType",feline_sdk_prod."PomodoroEndReason" TO blog_sdk_prod_runtime;
DO $rls$
DECLARE object_name text;
BEGIN
  FOR object_name IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='feline_sdk_prod' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' LOOP
    EXECUTE pg_catalog.format('ALTER TABLE feline_sdk_prod.%I ENABLE ROW LEVEL SECURITY',object_name);
  END LOOP;
END $rls$;
GRANT SELECT,INSERT ON feline_sdk_prod.users TO blog_sdk_prod_runtime;
GRANT UPDATE(email,name,"emailVerified",image,"updatedAt","updateAt",username,avatar,phone,work,
  "profileCompletedAt","profileEmailSnapshot","profileEmailConfirmedAt","businessCreatedAt","businessUpdatedAt")
  ON feline_sdk_prod.users TO blog_sdk_prod_runtime;
CREATE POLICY sdk_runtime_select ON feline_sdk_prod.users FOR SELECT TO blog_sdk_prod_runtime USING(true);
CREATE POLICY sdk_runtime_insert ON feline_sdk_prod.users FOR INSERT TO blog_sdk_prod_runtime
  WITH CHECK(role='USER' AND "authMode"='sdk' AND password IS NULL AND "authVersion"=0);
CREATE POLICY sdk_runtime_update ON feline_sdk_prod.users FOR UPDATE TO blog_sdk_prod_runtime
  USING("authMode"='sdk') WITH CHECK("authMode"='sdk' AND password IS NULL);
GRANT SELECT,INSERT,DELETE ON feline_sdk_prod.sessions TO blog_sdk_prod_runtime;
GRANT SELECT,INSERT,UPDATE ON feline_sdk_prod.auth_accounts TO blog_sdk_prod_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON feline_sdk_prod.auth_verifications TO blog_sdk_prod_runtime;
GRANT SELECT,INSERT,UPDATE ON feline_sdk_prod.feline_auth_rate TO blog_sdk_prod_runtime;
CREATE POLICY sdk_runtime ON feline_sdk_prod.sessions TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
CREATE POLICY sdk_runtime ON feline_sdk_prod.auth_accounts TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
CREATE POLICY sdk_runtime ON feline_sdk_prod.auth_verifications TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
CREATE POLICY sdk_runtime ON feline_sdk_prod.feline_auth_rate TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
DO $business$
DECLARE object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY['Blog','Tag','Todo','TagsOnTodos','TagsOnBlogs','BlogLike','BlogFavorite',
    'DailyStat','WorkoutItem','WorkoutSet','Exercise','Prompt','PomodoroRecord','Checklist','ChecklistItem'] LOOP
    EXECUTE pg_catalog.format('GRANT SELECT,INSERT,UPDATE,DELETE ON feline_sdk_prod.%I TO blog_sdk_prod_runtime',object_name);
    EXECUTE pg_catalog.format('CREATE POLICY sdk_runtime ON feline_sdk_prod.%I TO blog_sdk_prod_runtime USING(true) WITH CHECK(true)',object_name);
  END LOOP;
END $business$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA feline_sdk_prod TO blog_sdk_prod_runtime;
GRANT SELECT ON feline_sdk_prod."AuthInstallState",feline_sdk_prod."BusinessRestoreRun" TO blog_sdk_prod_runtime;
CREATE POLICY sdk_runtime_read ON feline_sdk_prod."AuthInstallState" FOR SELECT TO blog_sdk_prod_runtime USING(true);
CREATE POLICY sdk_runtime_read ON feline_sdk_prod."BusinessRestoreRun" FOR SELECT TO blog_sdk_prod_runtime USING(true);
GRANT EXECUTE ON FUNCTION feline_sdk_prod.feline_sdk_lock_installation() TO blog_sdk_prod_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA feline_sdk_prod REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA feline_sdk_prod REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA feline_sdk_prod REVOKE ALL ON SEQUENCES FROM PUBLIC;
