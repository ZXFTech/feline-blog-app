BEGIN;
-- New objects created by this maintenance identity start private.
DO $$ DECLARE actor text; target text; BEGIN
 FOREACH actor IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role'] LOOP
  IF actor='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=actor) THEN
   target:=CASE WHEN actor='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(actor) END;
   EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM %s',target);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %s',target);
   EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM %s',target);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %s',target);
  END IF;
 END LOOP;
END $$;
COMMIT;
