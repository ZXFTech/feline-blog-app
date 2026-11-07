-- SDK 0.1.6 schema for an explicitly authorized new empty target only.
-- Existing data is rejected. Role specific grants are a separate reviewed step.
BEGIN;
DO $guard$
DECLARE table_name text; populated boolean;
BEGIN
  FOR table_name IN SELECT c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' LOOP
    EXECUTE pg_catalog.format('SELECT EXISTS(SELECT 1 FROM public.%I)', table_name) INTO populated;
    IF populated THEN RAISE EXCEPTION 'SDK_TARGET_NOT_EMPTY'; END IF;
  END LOOP;
END $guard$;

ALTER TABLE public.users
  ALTER COLUMN username SET DEFAULT '', ALTER COLUMN "authMode" SET DEFAULT 'sdk',
  ADD COLUMN name text NOT NULL DEFAULT '', ADD COLUMN "emailVerified" boolean NOT NULL DEFAULT false,
  ADD COLUMN image text, ADD COLUMN "updatedAt" timestamptz(3) NOT NULL,
  ADD COLUMN "profileCompletedAt" timestamptz(3), ADD COLUMN "profileEmailSnapshot" citext,
  ADD COLUMN "profileEmailConfirmedAt" timestamptz(3), ADD COLUMN "businessCreatedAt" timestamptz(3),
  ADD COLUMN "businessUpdatedAt" timestamptz(3);
ALTER TABLE public.users DROP CONSTRAINT feline_auth_user_mode;
ALTER TABLE public.users ADD CONSTRAINT feline_auth_user_mode CHECK (
  ("authMode"='sdk' AND password IS NULL) OR
  ("authMode"='legacy' AND password IS NOT NULL) OR
  ("authMode"='center' AND password IS NULL AND "authVersion">0));
ALTER TABLE public.users ADD CONSTRAINT sdk_profile_complete CHECK (
  "profileCompletedAt" IS NULL OR (
    "profileEmailSnapshot" IS NOT NULL AND "profileEmailConfirmedAt" IS NOT NULL AND
    "businessCreatedAt" IS NOT NULL AND "businessUpdatedAt" IS NOT NULL AND
    char_length(username) BETWEEN 1 AND 64 AND username=btrim(username) AND username !~ '[[:cntrl:]]'));

-- Retain legacy storage as an inactive asset. The new adapter never reads it.
ALTER TABLE public.sessions RENAME TO legacy_sessions;
ALTER TABLE public.legacy_sessions RENAME CONSTRAINT sessions_pkey TO legacy_sessions_pkey;
ALTER INDEX public."sessions_sessionToken_key" RENAME TO "legacy_sessions_sessionToken_key";
ALTER TABLE public.legacy_sessions RENAME CONSTRAINT "sessions_userId_fkey" TO "legacy_sessions_userId_fkey";
CREATE TABLE public.sessions (
  id varchar(191) PRIMARY KEY, token text NOT NULL UNIQUE, "userId" varchar(191) NOT NULL,
  "expiresAt" timestamptz(3) NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL, "ipAddress" text, "userAgent" text,
  CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sessions_userId_idx" ON public.sessions("userId");
CREATE TABLE public.auth_accounts (
  id varchar(191) PRIMARY KEY, "providerId" text NOT NULL, "accountId" text NOT NULL,
  "userId" varchar(191) NOT NULL, "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz(3), "refreshTokenExpiresAt" timestamptz(3), scope text, password text,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "auth_accounts_providerId_accountId_key" UNIQUE ("providerId","accountId"),
  CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "auth_accounts_userId_idx" ON public.auth_accounts("userId");
CREATE TABLE public.auth_verifications (
  id varchar(191) PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz(3) NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz(3) NOT NULL
);
CREATE INDEX "auth_verifications_identifier_idx" ON public.auth_verifications(identifier);

CREATE TABLE public."BusinessRestoreRun" (
  id uuid PRIMARY KEY, "backupId" uuid NOT NULL, "manifestSha256" char(64) NOT NULL,
  "planDigest" char(64) NOT NULL, "targetGeneration" uuid NOT NULL,
  "sourceUserId" varchar(191) NOT NULL, "targetUserId" varchar(191) NOT NULL,
  "rowCounts" jsonb NOT NULL, "contentDigest" char(64) NOT NULL, "completedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "BusinessRestoreRun_targetGeneration_manifestSha256_key" UNIQUE ("targetGeneration","manifestSha256"),
  CONSTRAINT "BusinessRestoreRun_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("manifestSha256" ~ '^[0-9a-f]{64}$' AND "planDigest" ~ '^[0-9a-f]{64}$' AND "contentDigest" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "BusinessRestoreRun_targetUserId_idx" ON public."BusinessRestoreRun"("targetUserId");
CREATE TABLE public."AuthInstallState" (
  id text PRIMARY KEY DEFAULT 'primary' CHECK (id='primary'), phase text NOT NULL DEFAULT 'awaiting_root',
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0), "targetGeneration" uuid NOT NULL,
  "rootUserId" varchar(191), "rootInitializedAt" timestamptz(3), "rootIssuer" text,
  "rootSubjectDigest" char(64), "operatorLabel" text, "bootstrapPlanDigest" char(64),
  "restoreRunId" uuid UNIQUE, "activationPlanDigest" char(64), "activationEvidenceRef" text,
  "activationEvidenceSha256" char(64), "activatedAt" timestamptz(3),
  CONSTRAINT "AuthInstallState_rootUserId_fkey" FOREIGN KEY ("rootUserId") REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AuthInstallState_restoreRunId_fkey" FOREIGN KEY ("restoreRunId") REFERENCES public."BusinessRestoreRun"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (phase IN ('awaiting_root','awaiting_restore','ready')),
  CHECK (phase='awaiting_root' OR ("rootUserId" IS NOT NULL AND "rootInitializedAt" IS NOT NULL AND "rootIssuer" IS NOT NULL AND "rootSubjectDigest" IS NOT NULL AND "bootstrapPlanDigest" IS NOT NULL)),
  CHECK (phase<>'ready' OR ("restoreRunId" IS NOT NULL AND "activationPlanDigest" IS NOT NULL AND "activationEvidenceRef" IS NOT NULL AND "activationEvidenceSha256" IS NOT NULL AND "activatedAt" IS NOT NULL)),
  CHECK ("rootSubjectDigest" IS NULL OR "rootSubjectDigest" ~ '^[0-9a-f]{64}$'),
  CHECK ("bootstrapPlanDigest" IS NULL OR "bootstrapPlanDigest" ~ '^[0-9a-f]{64}$'),
  CHECK ("activationPlanDigest" IS NULL OR "activationPlanDigest" ~ '^[0-9a-f]{64}$'),
  CHECK ("activationEvidenceSha256" IS NULL OR "activationEvidenceSha256" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "AuthInstallState_rootUserId_idx" ON public."AuthInstallState"("rootUserId");
INSERT INTO public."AuthInstallState"(id,"targetGeneration") VALUES ('primary',gen_random_uuid());

CREATE FUNCTION public.feline_sdk_guard_user() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE maintenance boolean;
BEGIN
  SELECT pg_catalog.pg_has_role(session_user,c.relowner,'USAGE') INTO maintenance
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='users';
  IF NOT coalesce(maintenance,false) THEN
    IF TG_OP='INSERT' AND (NEW.role<>'USER' OR NEW."authMode"<>'sdk' OR NEW.password IS NOT NULL) THEN RAISE EXCEPTION 'SDK_RUNTIME_USER_INSERT_REJECTED'; END IF;
    IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW."authMode" IS DISTINCT FROM OLD."authMode" OR NEW.password IS DISTINCT FROM OLD.password OR NEW."authVersion" IS DISTINCT FROM OLD."authVersion") THEN RAISE EXCEPTION 'SDK_RUNTIME_AUTHORITY_CHANGE_REJECTED'; END IF;
    IF TG_OP='DELETE' AND OLD."profileCompletedAt" IS NOT NULL THEN RAISE EXCEPTION 'SDK_COMPLETED_USER_DELETE_REJECTED'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.feline_sdk_guard_user() FROM PUBLIC;
CREATE TRIGGER feline_sdk_guard_user BEFORE INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.feline_sdk_guard_user();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthInstallState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BusinessRestoreRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users,public.sessions,public.legacy_sessions,public.auth_accounts,public.auth_verifications,public."AuthInstallState",public."BusinessRestoreRun" FROM PUBLIC;
DO $acl$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','app_runtime'] LOOP
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON public.users,public.sessions,public.legacy_sessions,public.auth_accounts,public.auth_verifications,public."AuthInstallState",public."BusinessRestoreRun" FROM %I',role_name);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.feline_sdk_guard_user() FROM %I',role_name);
    END IF;
  END LOOP;
END $acl$;
-- Deliberately no runtime grants here: the exact selected role, memberships,
-- column permissions, RLS policies and adapter DML must be reviewed in an isolated target.
-- Never grant role UPDATE, installation writes, receipt writes or owner membership.
-- Lock only the fixed installation row, without allowing runtime state writes.
CREATE FUNCTION public.feline_sdk_lock_installation() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lock$
BEGIN
  PERFORM id FROM public."AuthInstallState" WHERE id='primary' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SDK_INSTALLATION_MISSING'; END IF;
END $lock$;
REVOKE ALL ON FUNCTION public.feline_sdk_lock_installation() FROM PUBLIC;
COMMIT;
