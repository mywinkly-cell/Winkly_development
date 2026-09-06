-- ─────────────────────────────────────────────────────────────────────────────
-- Date-of-birth: API-level column lockdown (GDPR data minimisation)
-- Follows 20260905120000, which already switched the exposed surfaces to age.
--
-- This closes the remaining gap: other users could still read the raw birthday
-- column directly via the API. After this, only age is ever readable cross-user;
-- the exact DOB is owner-only.
--
-- Why it needs care: Postgres column grants are role-wide, so revoking birthday
-- from `authenticated` breaks EVERY security-invoker reader of it. The full set
-- of invoker readers was enumerated from the migration history (grep of every
-- object that reads birthday / computes AGE); both are handled here, before the
-- revoke:
--   • public_profile_view (invoker view that derives age from birthday) →
--     computes age through a SECURITY DEFINER helper, so the view no longer
--     reads the column itself.
--   • romance_new_matches / _liked_profiles / _likes_received /
--     _pending_chat_invites (invoker feed functions that read birthday to show
--     age) → flipped to SECURITY DEFINER. Each already refuses to run for anyone
--     but auth.uid() (an explicit guard), so DEFINER cannot be aimed at another
--     user — the same pattern as romance_discover_feed_geo.
-- friend_profiles is deliberately NOT touched: although it is a security-invoker
-- view, it never selects birthday and exposes no age column, so the revoke does
-- not affect it (verified against its definition; it is also unused by the app).
-- Every other age-computing reader (chat triggers, romance_like_* helpers,
-- weekly_spark_active_users) is already SECURITY DEFINER and unaffected.
--
-- Owner reads their own DOB (edit screen's date picker) via get_my_birthday().
--
-- App reads of the birthday column are repointed in the same change set
-- (splash / postAuthRouting / accountTypeSwitch drop it; preview / profile-core
-- use get_my_birthday()). event-details already reads age from the view.
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · Age helper — reads birthday as the definer, returns only the coarse age.
CREATE OR REPLACE FUNCTION public._age_from_uid(p_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXTRACT(YEAR FROM AGE(COALESCE(birthday, '2000-01-01'::date)))::int
  FROM public.user_profiles WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION public._age_from_uid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._age_from_uid(uuid) TO authenticated;

-- 2 · public_profile_view — age via the helper (no direct birthday read).
CREATE OR REPLACE VIEW public.public_profile_view AS
  SELECT
    p.id, p.first_name, p.last_name, p.gender,
    public._age_from_uid(p.id) AS age,
    p.city, p.education, p.languages, p.occupation, p.interests,
    p.core_photos, p.main_photo_url, p.instagram, p.created_at, p.updated_at,
    pm.bio AS bio_romance, pm.photos AS romance_photos,
    pm.interests AS romance_interests, pm.meta AS romance_meta
  FROM public.user_profiles p
  LEFT JOIN public.profiles_mode pm ON pm.user_id = p.id AND pm.mode = 'romance';
ALTER VIEW public.public_profile_view SET (security_invoker = on);
GRANT SELECT ON public.public_profile_view TO authenticated;

-- 3 · The four invoker feed functions read birthday to show age. Each already
--     guards `current_user_id = auth.uid()`, so running as DEFINER is safe and
--     lets them keep reading the column after the revoke.
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.romance_new_matches(uuid)',
    'public.romance_liked_profiles(uuid)',
    'public.romance_likes_received(uuid)',
    'public.romance_pending_chat_invites(uuid)'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', v_sig);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'birthday-lockdown: % not found, skipping', v_sig;
    END;
  END LOOP;
END $$;

-- 4 · Owner reads their own DOB (needed by the edit screen's date picker).
CREATE OR REPLACE FUNCTION public.get_my_birthday()
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT birthday FROM public.user_profiles WHERE id = auth.uid(); $$;
REVOKE ALL ON FUNCTION public.get_my_birthday() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_birthday() TO authenticated;

COMMENT ON FUNCTION public.get_my_birthday() IS
  'Returns the calling user''s own date of birth. Owner-only by construction: keyed on auth.uid(), no parameter.';

-- 5 · Revoke birthday cross-user. Drop the blanket SELECT and re-grant every
--     column except birthday (list built from the live catalogue so it can''t
--     drift). Owner writes are unaffected (INSERT/UPDATE grants are separate).
REVOKE SELECT ON public.user_profiles FROM authenticated;
REVOKE SELECT ON public.user_profiles FROM anon;

DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='user_profiles' AND column_name <> 'birthday';
  IF v_cols IS NULL OR v_cols = '' THEN
    RAISE EXCEPTION 'birthday-lockdown: no grantable columns for user_profiles';
  END IF;
  EXECUTE format('GRANT SELECT (%s) ON public.user_profiles TO authenticated', v_cols);
END $$;

COMMENT ON COLUMN public.user_profiles.birthday IS
  'Exact DOB. Owner-only: excluded from the authenticated SELECT grant. Other users see a derived age (via public_profile_view / friend_profiles / feed functions); the owner reads their own via get_my_birthday().';
