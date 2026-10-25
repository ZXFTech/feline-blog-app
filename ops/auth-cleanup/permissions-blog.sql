GRANT USAGE ON SCHEMA public TO auth_ops_owner;
ALTER FUNCTION public.cleanup_auth_rows_at(integer,timestamptz) OWNER TO feline_auth_owner;
ALTER FUNCTION public.cleanup_auth_rows(integer) OWNER TO feline_auth_owner;
REVOKE ALL ON FUNCTION public.cleanup_auth_rows_at(integer,timestamptz),public.cleanup_auth_rows(integer) FROM PUBLIC,__RUNTIME__;
GRANT EXECUTE ON FUNCTION public.cleanup_auth_rows_at(integer,timestamptz) TO auth_ops_owner;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.cleanup_auth_rows_at(integer,timestamptz),public.cleanup_auth_rows(integer) FROM %I',r);
  END IF;
 END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['feline_auth_browser','feline_auth_flow','feline_auth_session','feline_auth_rate'] LOOP
  EXECUTE format('REVOKE SELECT ON public.%I FROM auth_ops_owner',t);
  EXECUTE format('DROP POLICY IF EXISTS auth_ops_summary ON public.%I',t);
  EXECUTE format('CREATE POLICY auth_ops_summary ON public.%I TO auth_ops_owner USING(true)',t);
 END LOOP;
END $$;
GRANT SELECT(id,expires_at) ON public.feline_auth_browser TO auth_ops_owner;
GRANT SELECT(browser_state_id,expires_at,created_at,status) ON public.feline_auth_flow TO auth_ops_owner;
GRANT SELECT(browser_state_id,expires_at,revoked_at) ON public.feline_auth_session TO auth_ops_owner;
GRANT SELECT(expires_at) ON public.feline_auth_rate TO auth_ops_owner;
