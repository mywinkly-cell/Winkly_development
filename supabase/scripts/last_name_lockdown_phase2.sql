-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-12 PHASE 2 — make the raw last_name owner-only (like birthday).
--
-- Run ONLY after the app update that reads last_name_public / my_profile and
-- writes the profile with writeOwnUserProfile has reached users (OTA via
-- expo-updates or store release). Older app builds select last_name directly
-- from user_profiles and upsert it during onboarding — both are refused once
-- this runs, which breaks their chat lists and onboarding.
--
-- Requires 20260927140000_last_name_privacy.sql. Idempotent. When production has
-- it, move this file into supabase/migrations/ (with a new timestamp) so fresh
-- environments get it too. CI applies it before the security tests.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON public.user_profiles FROM authenticated;
REVOKE SELECT ON public.user_profiles FROM anon;

DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_profiles'
    AND column_name NOT IN ('birthday', 'last_name');
  EXECUTE format('GRANT SELECT (%s) ON public.user_profiles TO authenticated', v_cols);
END $$;

COMMENT ON COLUMN public.user_profiles.last_name IS
  'Real last name. Owner-only: excluded from the authenticated SELECT grant. Other users read last_name_public; the owner reads public.my_profile.';
