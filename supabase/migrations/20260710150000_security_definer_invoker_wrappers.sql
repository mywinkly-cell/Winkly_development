-- Splinter 0029 — wrap remaining public SECURITY DEFINER client RPCs (prod follow-up).
-- Runs after 20260710140000_client_rpc_security_invoker.sql (partial INVOKER rewrites).
-- Idempotent: only moves functions still SECURITY DEFINER in public.

CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
DECLARE
  r record;
  v_args_call text;
  v_public_sig regprocedure;
  v_private_sig regprocedure;
  v_body text;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.oid::regprocedure AS signature,
      p.proname,
      p.proretset,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_result(p.oid) AS result_type,
      CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        ELSE 'VOLATILE'
      END AS volatility
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT (p.proname = 'romance_like_profile' AND p.pronargs = 2)
    ORDER BY p.proname, p.oid::regprocedure::text
  LOOP
    SELECT string_agg(
      CASE
        WHEN p.proargnames IS NOT NULL
         AND array_length(p.proargnames, 1) >= gs
         AND coalesce(p.proargnames[gs], '') <> ''
        THEN quote_ident(p.proargnames[gs])
        ELSE format('$%s', gs)
      END,
      ', ' ORDER BY gs
    )
    INTO v_args_call
    FROM pg_proc p
    CROSS JOIN generate_series(1, p.pronargs) AS gs
    WHERE p.oid = r.oid;

    v_args_call := coalesce(v_args_call, '');

    EXECUTE format('ALTER FUNCTION %s SET SCHEMA private', r.signature);

    v_private_sig := replace(r.signature::text, 'public.', 'private.')::regprocedure;

    IF r.proretset THEN
      v_body := format('SELECT * FROM private.%I(%s)', r.proname, v_args_call);
    ELSE
      v_body := format('SELECT private.%I(%s)', r.proname, v_args_call);
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql %s SECURITY INVOKER SET search_path = public, private AS $wrapper$ %s $wrapper$',
      r.proname,
      r.identity_args,
      r.result_type,
      r.volatility,
      v_body
    );

    v_public_sig := r.signature;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_public_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_public_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_public_sig);

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_private_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_private_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_private_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_private_sig);
  END LOOP;
END $$;

-- 2-arg romance_like_profile shim (only when needed).
DO $$
BEGIN
  IF to_regprocedure('private.romance_like_profile(uuid, uuid, boolean, text)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.romance_like_profile(current_user_id uuid, target_user_id uuid)
      RETURNS jsonb
      LANGUAGE sql
      VOLATILE
      SECURITY INVOKER
      SET search_path = public, private
      AS $body$
        SELECT private.romance_like_profile(current_user_id, target_user_id, false, NULL::text);
      $body$;
    $sql$;
  ELSIF to_regprocedure('public.romance_like_profile(uuid, uuid, boolean, text)') IS NOT NULL
    AND to_regprocedure('public.romance_like_profile(uuid, uuid)') IS NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.romance_like_profile(current_user_id uuid, target_user_id uuid)
      RETURNS jsonb
      LANGUAGE sql
      VOLATILE
      SECURITY INVOKER
      SET search_path = public
      AS $body$
        SELECT public.romance_like_profile(current_user_id, target_user_id, false, NULL::text);
      $body$;
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.romance_like_profile(uuid, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.romance_like_profile(uuid, uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.romance_like_profile(uuid, uuid) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.romance_like_profile(uuid, uuid) TO authenticated';
  END IF;
END $$;
