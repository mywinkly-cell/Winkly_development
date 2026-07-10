-- Lock down search_path on all Winkly-owned public functions (Splinter 0011).
-- Extension-owned functions (vector, pg_trgm, etc.) are excluded via pg_depend.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    LEFT JOIN pg_depend dep
      ON p.oid = dep.objid
     AND dep.deptype = 'e'
     AND dep.classid = 'pg_proc'::regclass
    WHERE n.nspname = 'public'
      AND dep.objid IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}')) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.signature);
  END LOOP;
END $$;
