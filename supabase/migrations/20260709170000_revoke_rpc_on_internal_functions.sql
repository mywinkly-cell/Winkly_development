-- Revoke direct /rpc access to trigger-internal and service-only SECURITY DEFINER
-- functions (Splinter 0029). Triggers keep working; only PostgREST exposure is removed.

DO $$
DECLARE
  r record;
BEGIN
  -- 1) Trigger-attached SECURITY DEFINER functions (never client RPCs)
  FOR r IN
    SELECT DISTINCT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_trigger t ON t.tgfoid = p.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      r.signature
    );
  END LOOP;

  -- 2) Maintainer / background-job RPCs (service_role only)
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'rls_audit_report',
        'rls_auto_enable',
        'upsert_compatibility_score',
        'business_profiles_instead_of_insert',
        'business_profiles_instead_of_update',
        'handle_new_auth_user'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      r.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      r.signature
    );
  END LOOP;
END $$;
