BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='feline_auth_owner') THEN CREATE ROLE feline_auth_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='__RUNTIME__' AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'RUNTIME_ROLE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='feline_auth_owner' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)) THEN RAISE EXCEPTION 'FUNCTION_OWNER_INVALID'; END IF;
 IF pg_has_role('__RUNTIME__','feline_auth_owner','MEMBER') THEN RAISE EXCEPTION 'RUNTIME_INHERITS_OWNER'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relname='users' OR c.relname LIKE 'feline_auth_%') AND pg_has_role('__RUNTIME__',c.relowner,'MEMBER')) THEN RAISE EXCEPTION 'RUNTIME_OWNS_OBJECTS'; END IF;
 EXECUTE format('GRANT feline_auth_owner TO %I WITH SET TRUE,INHERIT TRUE',current_user);
END $$;
GRANT USAGE,CREATE ON SCHEMA public TO feline_auth_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE feline_auth_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO feline_auth_owner;
GRANT SELECT,INSERT ON public.users TO feline_auth_owner;
GRANT UPDATE("authMode","authVersion",password) ON public.users TO feline_auth_owner;
REVOKE ALL ON public.users FROM __RUNTIME__,PUBLIC;
GRANT SELECT ON public.users TO __RUNTIME__;
GRANT UPDATE(username,avatar,work,phone) ON public.users TO __RUNTIME__;
DO $$ DECLARE r text; t text; f record; cols text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','PUBLIC','__RUNTIME__'] LOOP
  IF r='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   -- Clear historical column ACLs as well as table grants.
   SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.users'::regclass AND attnum>0 AND NOT attisdropped;
   EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.users FROM %s',cols,cols,cols,CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
   IF r<>'__RUNTIME__' THEN EXECUTE format('REVOKE ALL ON public.users FROM %s',CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END); EXECUTE format('REVOKE SELECT(%s) ON public.users FROM %s',cols,CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END); END IF;
  END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['feline_auth_identity','feline_auth_browser','feline_auth_flow','feline_auth_session','feline_auth_rate'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO feline_auth_owner',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,__RUNTIME__',t);
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
  FOREACH r IN ARRAY ARRAY['PUBLIC','__RUNTIME__','anon','authenticated','service_role'] LOOP
   IF r='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
    EXECUTE format('REVOKE ALL ON public.%I FROM %s',t,CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
    EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM %s',cols,cols,cols,cols,t,CASE WHEN r='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
   END IF;
  END LOOP;
  EXECUTE format('DROP POLICY IF EXISTS feline_auth_runtime ON public.%I',t);
  EXECUTE format('CREATE POLICY feline_auth_runtime ON public.%I TO __RUNTIME__ USING(true) WITH CHECK(true)',t);
  EXECUTE format('GRANT SELECT ON public.%I TO __RUNTIME__',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('feline_auth_complete','complete_legacy_binding','complete_new_profile','complete_center_login','logout_browser','commit_legacy_login','revoke_local_session','cleanup_auth_rows','cleanup_auth_rows_at','feline_auth_guard_user','feline_auth_guard_flow') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO feline_auth_owner',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,__RUNTIME__',f.signature);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,r); END IF;
  END LOOP;
 END LOOP;
END $$;
GRANT UPDATE(username,avatar,work,phone) ON public.users TO __RUNTIME__;
GRANT UPDATE(verified_email,email_verified_at) ON public.feline_auth_identity TO __RUNTIME__;
GRANT INSERT ON public.feline_auth_browser,public.feline_auth_flow TO __RUNTIME__;
GRANT UPDATE(current_flow_id,expires_at,updated_at) ON public.feline_auth_browser TO __RUNTIME__;
GRANT UPDATE(status,protocol_encrypted,candidate_encrypted,candidate_digest,confirmation_revision) ON public.feline_auth_flow TO __RUNTIME__;
GRANT INSERT,UPDATE,DELETE ON public.feline_auth_rate TO __RUNTIME__;
GRANT EXECUTE ON FUNCTION public.complete_legacy_binding(jsonb),public.complete_new_profile(jsonb),public.complete_center_login(jsonb),public.logout_browser(uuid,integer),public.commit_legacy_login(uuid,integer,text,integer),public.revoke_local_session(uuid) TO __RUNTIME__;
DROP POLICY IF EXISTS feline_auth_owner_users ON public.users;
CREATE POLICY feline_auth_owner_users ON public.users TO feline_auth_owner USING(true) WITH CHECK(true);
REVOKE CREATE ON SCHEMA public FROM feline_auth_owner;
DO $$ BEGIN EXECUTE format('GRANT feline_auth_owner TO %I WITH SET FALSE,INHERIT FALSE',current_user); END $$;
COMMIT;
