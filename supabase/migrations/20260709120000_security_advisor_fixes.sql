-- Security Advisor fixes (Supabase Splinter)
--
-- 1. public_profile_view — security_invoker was dropped when 20260623120000 recreated the view.
-- 2. pending_plans_with_confirmation_counts — created without security_invoker.
-- 3. spatial_ref_sys — PostGIS catalog in public; revoke API access (cannot enable RLS as non-owner).
-- 4. private.webhook_config — RLS on with no policies; explicit deny for API roles.

-- ── 1 & 2: security_invoker views ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'public_profile_view' AND c.relkind = 'v'
  ) THEN
    ALTER VIEW public.public_profile_view SET (security_invoker = on);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'pending_plans_with_confirmation_counts'
      AND c.relkind = 'v'
  ) THEN
    ALTER VIEW public.pending_plans_with_confirmation_counts SET (security_invoker = on);
  END IF;
END $$;

-- ── 3: PostGIS catalog tables (extension-owned; RLS not togglable by project role) ──
-- REVOKE is best-effort: tables are owned by supabase_admin; if it no-ops, the Splinter
-- rls_disabled_in_public lint on spatial_ref_sys is a known PostGIS false positive (no user data).
DO $$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.geometry_columns') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.geometry_columns FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.geography_columns') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.geography_columns FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── 4: webhook_config — service-only singleton; no client/API access ──────────
DROP POLICY IF EXISTS webhook_config_no_api ON private.webhook_config;
CREATE POLICY webhook_config_no_api ON private.webhook_config
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
