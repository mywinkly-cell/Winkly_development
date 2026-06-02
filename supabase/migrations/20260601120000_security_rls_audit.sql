-- Security: RLS audit helper + tighten anonymous writes on catalog tables
-- Run in SQL editor: SELECT * FROM public.rls_audit_report();

CREATE OR REPLACE FUNCTION public.rls_audit_report()
RETURNS TABLE (
  schema_name text,
  table_name text,
  rls_enabled boolean,
  policy_count bigint,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    (
      SELECT count(*)::bigint
      FROM pg_policies p
      WHERE p.schemaname = n.nspname AND p.tablename = c.relname
    ) AS policy_count,
    CASE
      WHEN NOT c.relrowsecurity THEN 'FAIL: RLS disabled'
      WHEN (
        SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = n.nspname AND p.tablename = c.relname
      ) = 0 THEN 'WARN: RLS on but no policies (default deny)'
      ELSE 'OK'
    END AS status
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY status DESC, c.relname;
$$;

REVOKE ALL ON FUNCTION public.rls_audit_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_audit_report() TO service_role;

COMMENT ON FUNCTION public.rls_audit_report IS
  'Maintainer-only: lists public tables, RLS flag, policy count. service_role only.';

-- Ensure RLS on every public heap table (idempotent).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      -- PostGIS catalog tables are owned by the extension; do not ALTER them here.
      AND c.relname NOT IN ('spatial_ref_sys', 'geometry_columns', 'geography_columns')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- Catalog tables: public read, authenticated write only (no anon INSERT/UPDATE).
DROP POLICY IF EXISTS companies_insert ON public.companies;
DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_insert ON public.companies
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY companies_update ON public.companies
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS business_services_insert ON public.business_services;
DROP POLICY IF EXISTS business_services_update ON public.business_services;
CREATE POLICY business_services_insert ON public.business_services
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY business_services_update ON public.business_services
  FOR UPDATE USING (auth.uid() IS NOT NULL);
