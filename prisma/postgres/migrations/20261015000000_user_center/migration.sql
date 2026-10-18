-- Additive schema. ACL installation is a separate, explicit maintenance step.
ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE public.users ADD COLUMN "authMode" varchar(10) NOT NULL DEFAULT 'legacy', ADD COLUMN "authVersion" integer NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD CONSTRAINT feline_auth_user_mode CHECK (("authMode"='legacy' AND password IS NOT NULL) OR ("authMode"='center' AND password IS NULL AND "authVersion">0)), ADD CONSTRAINT feline_auth_user_version CHECK ("authVersion">=0);
CREATE TABLE public.feline_auth_identity (
 id uuid PRIMARY KEY, issuer text NOT NULL, subject text COLLATE "C" NOT NULL,
 user_id varchar(191) NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
 verified_email text NOT NULL, email_verified_at timestamptz(3) NOT NULL,
 bound_at timestamptz(3) NOT NULL DEFAULT now(), created_from text NOT NULL CHECK (created_from IN ('legacy_binding','new_profile')),
 legacy_verified_at timestamptz(3), UNIQUE(issuer,subject), UNIQUE(id,user_id)
);
CREATE TABLE public.feline_auth_browser (
 id uuid PRIMARY KEY, browser_token_hash text NOT NULL UNIQUE,
 epoch integer NOT NULL DEFAULT 0 CHECK(epoch>=0), current_flow_id uuid,
 require_fresh_auth boolean NOT NULL DEFAULT false, last_logout_at timestamptz(3),
 expires_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX ON public.feline_auth_browser(expires_at);
CREATE TABLE public.feline_auth_flow (
 id uuid PRIMARY KEY, purpose text NOT NULL CHECK(purpose IN ('login','bind')), state_hash text NOT NULL UNIQUE,
 browser_state_id uuid NOT NULL REFERENCES public.feline_auth_browser(id), browser_epoch integer NOT NULL CHECK(browser_epoch>=0),
 protocol_encrypted text, candidate_encrypted text, candidate_digest text, confirmation_revision integer NOT NULL DEFAULT 0 CHECK(confirmation_revision>=0),
 created_at timestamptz(3) NOT NULL DEFAULT now(), expires_at timestamptz(3) NOT NULL,
 status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','exchanging','pending_choice','pending_confirmation','consumed','cancelled','replaced','expired','failed')),
 legacy_user_id varchar(191) REFERENCES public.users(id), legacy_auth_version integer, legacy_verified_at timestamptz(3),
 require_fresh_auth boolean NOT NULL DEFAULT false, reauth_after timestamptz(3), destination text NOT NULL CHECK(destination IN ('/','/profile','/dashboard')),
 UNIQUE(id,browser_state_id), CHECK(expires_at <= created_at + interval '300 seconds' AND expires_at>created_at),
 CHECK ((purpose='bind' AND legacy_user_id IS NOT NULL AND legacy_auth_version IS NOT NULL AND legacy_verified_at IS NOT NULL AND require_fresh_auth) OR (purpose='login' AND legacy_user_id IS NULL AND legacy_auth_version IS NULL AND legacy_verified_at IS NULL)),
 CHECK (NOT require_fresh_auth OR reauth_after IS NOT NULL)
);
CREATE INDEX ON public.feline_auth_flow(expires_at);
ALTER TABLE public.feline_auth_browser ADD CONSTRAINT feline_auth_current_flow FOREIGN KEY(current_flow_id,id) REFERENCES public.feline_auth_flow(id,browser_state_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.feline_auth_session (
 id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE, user_id varchar(191) NOT NULL REFERENCES public.users(id),
 identity_id uuid NOT NULL, auth_version integer NOT NULL CHECK(auth_version>0),
 browser_state_id uuid NOT NULL REFERENCES public.feline_auth_browser(id), browser_epoch integer NOT NULL CHECK(browser_epoch>=0),
 grant_encrypted text, grant_key_id text, center_session_id text NOT NULL, center_token_expires_at timestamptz(3) NOT NULL,
 expires_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), revoked_at timestamptz(3),
 FOREIGN KEY(identity_id,user_id) REFERENCES public.feline_auth_identity(id,user_id),
 CHECK(revoked_at IS NOT NULL OR (grant_encrypted IS NOT NULL AND grant_key_id IS NOT NULL)),
 CHECK(expires_at<=center_token_expires_at AND expires_at<=created_at+interval '7 days')
);
CREATE INDEX ON public.feline_auth_session(expires_at);
CREATE INDEX ON public.feline_auth_session(browser_state_id);
CREATE UNIQUE INDEX feline_auth_one_browser_session ON public.feline_auth_session(browser_state_id) WHERE revoked_at IS NULL;
CREATE TABLE public.feline_auth_rate (
 key_hash text NOT NULL, operation text NOT NULL, window_start timestamptz(3) NOT NULL,
 count integer NOT NULL DEFAULT 0 CHECK(count>=0), expires_at timestamptz(3) NOT NULL,
 PRIMARY KEY(key_hash,operation,window_start)
);
CREATE INDEX ON public.feline_auth_rate(expires_at);

CREATE FUNCTION public.feline_auth_guard_user() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD."authMode"='center' AND (NEW."authMode"<>'center' OR NEW.password IS NOT NULL OR NEW."authVersion"<OLD."authVersion") THEN RAISE EXCEPTION 'AUTH_MODE_IRREVERSIBLE'; END IF;
 IF NEW."authVersion"<OLD."authVersion" THEN RAISE EXCEPTION 'AUTH_VERSION_IRREVERSIBLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER feline_auth_guard_user BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.feline_auth_guard_user();
CREATE FUNCTION public.feline_auth_guard_flow() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.purpose,NEW.state_hash,NEW.browser_state_id,NEW.browser_epoch,NEW.legacy_user_id,NEW.legacy_auth_version,NEW.legacy_verified_at,NEW.created_at,NEW.expires_at,NEW.require_fresh_auth,NEW.reauth_after,NEW.destination) IS DISTINCT FROM (OLD.id,OLD.purpose,OLD.state_hash,OLD.browser_state_id,OLD.browser_epoch,OLD.legacy_user_id,OLD.legacy_auth_version,OLD.legacy_verified_at,OLD.created_at,OLD.expires_at,OLD.require_fresh_auth,OLD.reauth_after,OLD.destination) THEN RAISE EXCEPTION 'FLOW_IMMUTABLE'; END IF;
 IF OLD.status IN ('consumed','cancelled','replaced','expired','failed') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'FLOW_TERMINAL'; END IF;
 IF OLD.candidate_digest IS NOT NULL AND (NEW.candidate_digest,NEW.confirmation_revision) IS DISTINCT FROM (OLD.candidate_digest,OLD.confirmation_revision) THEN RAISE EXCEPTION 'CANDIDATE_IMMUTABLE'; END IF;
 IF OLD.candidate_encrypted IS NOT NULL AND NEW.candidate_encrypted IS DISTINCT FROM OLD.candidate_encrypted AND NOT (NEW.candidate_encrypted IS NULL AND NEW.status IN ('consumed','cancelled','replaced','expired','failed')) THEN RAISE EXCEPTION 'CANDIDATE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER feline_auth_guard_flow BEFORE UPDATE ON public.feline_auth_flow FOR EACH ROW EXECUTE FUNCTION public.feline_auth_guard_flow();

-- Internal helper is never granted to the runtime role.
CREATE FUNCTION public.feline_auth_complete(p jsonb, kind text) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.feline_auth_browser; f public.feline_auth_flow; u public.users; i public.feline_auth_identity; now_at timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO b FROM public.feline_auth_browser WHERE id=(p->>'browser')::uuid FOR UPDATE;
 IF NOT FOUND OR b.epoch<>(p->>'epoch')::integer OR b.expires_at<=now_at OR b.current_flow_id IS DISTINCT FROM (p->>'flow')::uuid THEN RAISE EXCEPTION 'FLOW_REPLACED'; END IF;
 SELECT * INTO f FROM public.feline_auth_flow WHERE id=b.current_flow_id FOR UPDATE;
 IF NOT FOUND OR f.browser_state_id<>b.id OR f.browser_epoch<>b.epoch OR f.expires_at<=now_at OR f.candidate_digest IS DISTINCT FROM p->>'digest' OR f.confirmation_revision<>(p->>'revision')::integer OR f.candidate_encrypted IS NULL THEN RAISE EXCEPTION 'FLOW_EXPIRED'; END IF;
 IF (kind='bind' AND (f.purpose<>'bind' OR f.status<>'pending_confirmation')) OR (kind='new' AND (f.purpose<>'login' OR f.status<>'pending_choice')) OR (kind='login' AND (f.purpose<>'login' OR f.status<>'pending_choice')) THEN RAISE EXCEPTION 'FLOW_INVALID'; END IF;
 IF f.require_fresh_auth AND (NOT COALESCE((p->>'fresh')::boolean,false) OR f.reauth_after IS NULL) THEN RAISE EXCEPTION 'FRESH_AUTH_REQUIRED'; END IF;
 IF (p->>'exp')::timestamptz<=now_at THEN RAISE EXCEPTION 'SESSION_REVOKED'; END IF;
 IF kind='bind' THEN
   SELECT * INTO u FROM public.users WHERE id=f.legacy_user_id FOR UPDATE;
   IF NOT FOUND OR u."authMode"<>'legacy' OR u."authVersion"<>f.legacy_auth_version OR u.password IS NULL OR f.legacy_verified_at<now_at-interval '300 seconds' OR p->>'user'<>u.id OR NOT COALESCE((p->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'BINDING_UNAVAILABLE'; END IF;
   INSERT INTO public.feline_auth_identity(id,issuer,subject,user_id,verified_email,email_verified_at,created_from,legacy_verified_at) VALUES((p->>'identity')::uuid,p->>'issuer',p->>'sub',u.id,p->>'email',now_at,'legacy_binding',f.legacy_verified_at) RETURNING * INTO i;
   UPDATE public.users SET "authMode"='center',"authVersion"="authVersion"+1,password=NULL WHERE id=u.id RETURNING * INTO u;
   UPDATE public.feline_auth_session SET revoked_at=now_at,grant_encrypted=NULL,grant_key_id=NULL WHERE user_id=u.id AND revoked_at IS NULL;
 ELSIF kind='new' THEN
   IF NOT COALESCE((p->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'ONBOARDING_UNAVAILABLE'; END IF;
   IF EXISTS(SELECT 1 FROM public.feline_auth_identity WHERE issuer=p->>'issuer' AND subject=p->>'sub') THEN RAISE EXCEPTION 'IDENTITY_ALREADY_LINKED'; END IF;
   INSERT INTO public.users(id,email,username,password,role,"authMode","authVersion","updateAt") VALUES(p->>'user',p->>'email',p->>'username',NULL,'USER','center',1,now_at) RETURNING * INTO u;
   INSERT INTO public.feline_auth_identity(id,issuer,subject,user_id,verified_email,email_verified_at,created_from) VALUES((p->>'identity')::uuid,p->>'issuer',p->>'sub',u.id,p->>'email',now_at,'new_profile') RETURNING * INTO i;
 ELSE
   SELECT users.* INTO u FROM public.users users JOIN public.feline_auth_identity ident ON ident.user_id=users.id WHERE ident.issuer=p->>'issuer' AND ident.subject=p->>'sub' FOR UPDATE OF users;
   IF NOT FOUND OR u."authMode"<>'center' OR u.password IS NOT NULL THEN RAISE EXCEPTION 'IDENTITY_UNAVAILABLE'; END IF;
   SELECT * INTO i FROM public.feline_auth_identity WHERE user_id=u.id FOR UPDATE;
   IF i.id<>(p->>'identity')::uuid THEN RAISE EXCEPTION 'IDENTITY_UNAVAILABLE'; END IF;
   UPDATE public.feline_auth_identity SET verified_email=p->>'email',email_verified_at=now_at WHERE id=i.id;
 END IF;
 UPDATE public.feline_auth_session SET revoked_at=now_at,grant_encrypted=NULL,grant_key_id=NULL WHERE browser_state_id=b.id AND revoked_at IS NULL;
 INSERT INTO public.feline_auth_session(id,token_hash,user_id,identity_id,auth_version,browser_state_id,browser_epoch,grant_encrypted,grant_key_id,center_session_id,center_token_expires_at,expires_at) VALUES((p->>'session')::uuid,p->>'tokenHash',u.id,i.id,u."authVersion",b.id,b.epoch,p->>'encrypted',p->>'keyId',p->>'sid',(p->>'exp')::timestamptz,LEAST((p->>'exp')::timestamptz,now_at+interval '7 days'));
 UPDATE public.feline_auth_flow SET status='consumed',protocol_encrypted=NULL,candidate_encrypted=NULL WHERE id=f.id;
 UPDATE public.feline_auth_browser SET current_flow_id=NULL,require_fresh_auth=false,expires_at=now_at+interval '7 days',updated_at=now_at WHERE id=b.id;
 -- Row locks and uniqueness checks above may have waited across any deadline.
 -- Check the original proofs at the final database clock, rolling back all writes.
 now_at:=clock_timestamp();
 IF b.expires_at<=now_at THEN RAISE EXCEPTION 'FLOW_REPLACED'; END IF;
 IF f.expires_at<=now_at THEN RAISE EXCEPTION 'FLOW_EXPIRED'; END IF;
 IF (p->>'exp')::timestamptz<=now_at THEN RAISE EXCEPTION 'SESSION_REVOKED'; END IF;
 IF kind='bind' AND f.legacy_verified_at<=now_at-interval '300 seconds' THEN RAISE EXCEPTION 'BINDING_UNAVAILABLE'; END IF;
 RETURN u.id;
END $$;
CREATE FUNCTION public.complete_legacy_binding(p jsonb) RETURNS varchar LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.feline_auth_complete(p,'bind') $$;
CREATE FUNCTION public.complete_new_profile(p jsonb) RETURNS varchar LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.feline_auth_complete(p,'new') $$;
CREATE FUNCTION public.complete_center_login(p jsonb) RETURNS varchar LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.feline_auth_complete(p,'login') $$;

CREATE FUNCTION public.logout_browser(browser_id uuid, expected_epoch integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.feline_auth_browser;
BEGIN
 SELECT * INTO b FROM public.feline_auth_browser WHERE id=browser_id FOR UPDATE;
 IF NOT FOUND OR b.epoch<>expected_epoch THEN RAISE EXCEPTION 'FLOW_REPLACED'; END IF;
 UPDATE public.feline_auth_flow SET status='cancelled',protocol_encrypted=NULL,candidate_encrypted=NULL WHERE id=b.current_flow_id AND status IN ('created','exchanging','pending_choice','pending_confirmation');
 UPDATE public.feline_auth_browser SET epoch=epoch+1,require_fresh_auth=true,last_logout_at=clock_timestamp(),current_flow_id=NULL,expires_at=clock_timestamp()+interval '7 days',updated_at=clock_timestamp() WHERE id=b.id;
 UPDATE public.feline_auth_session SET revoked_at=clock_timestamp(),grant_encrypted=NULL,grant_key_id=NULL WHERE browser_state_id=b.id AND revoked_at IS NULL;
 RETURN b.epoch+1;
END $$;
CREATE FUNCTION public.commit_legacy_login(browser_id uuid, expected_epoch integer, user_id text, user_version integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.feline_auth_browser; u public.users;
BEGIN
 SELECT * INTO b FROM public.feline_auth_browser WHERE id=browser_id FOR UPDATE;
 IF NOT FOUND OR b.epoch<>expected_epoch OR b.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FLOW_REPLACED'; END IF;
 PERFORM 1 FROM public.feline_auth_flow WHERE id=b.current_flow_id FOR UPDATE;
 SELECT * INTO u FROM public.users WHERE id=user_id FOR UPDATE;
 IF NOT FOUND OR u."authMode"<>'legacy' OR u."authVersion"<>user_version OR u.password IS NULL THEN RAISE EXCEPTION 'INVALID_CREDENTIALS'; END IF;
 UPDATE public.feline_auth_flow SET status='cancelled',protocol_encrypted=NULL,candidate_encrypted=NULL WHERE id=b.current_flow_id AND status IN ('created','exchanging','pending_choice','pending_confirmation');
 UPDATE public.feline_auth_session SET revoked_at=clock_timestamp(),grant_encrypted=NULL,grant_key_id=NULL WHERE browser_state_id=b.id AND revoked_at IS NULL;
 UPDATE public.feline_auth_browser SET epoch=epoch+1,current_flow_id=NULL,expires_at=clock_timestamp()+interval '7 days',updated_at=clock_timestamp() WHERE id=b.id;
 RETURN b.epoch+1;
END $$;
CREATE FUNCTION public.revoke_local_session(session_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.feline_auth_browser WHERE id=(SELECT browser_state_id FROM public.feline_auth_session WHERE id=session_id) FOR UPDATE;
 UPDATE public.feline_auth_session SET revoked_at=clock_timestamp(),grant_encrypted=NULL,grant_key_id=NULL WHERE id=session_id AND revoked_at IS NULL;
END $$;
CREATE FUNCTION public.cleanup_auth_rows(batch integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b public.feline_auth_browser; cutoff timestamptz:=clock_timestamp(); ids uuid[];
 flows integer:=0; sessions integer:=0; browsers integer:=0; rates integer:=0; removed integer; pending boolean;
BEGIN
 IF batch IS NULL OR batch<1 OR batch>1000 THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
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

-- No function is a public RPC, even before the maintenance ACL step.
REVOKE ALL ON FUNCTION public.feline_auth_complete(jsonb,text), public.complete_legacy_binding(jsonb), public.complete_new_profile(jsonb), public.complete_center_login(jsonb), public.logout_browser(uuid,integer), public.commit_legacy_login(uuid,integer,text,integer), public.revoke_local_session(uuid), public.cleanup_auth_rows(integer) FROM PUBLIC;
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['feline_auth_identity','feline_auth_browser','feline_auth_flow','feline_auth_session','feline_auth_rate'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r); END IF;
  END LOOP;
 END LOOP;
END $$;
