-- ─────────────────────────────────────────────────────────────────────────────
-- Special-category & date-of-birth data handling (GDPR)
-- September 2026 follow-up to the August security audit.
--
-- Three decisions, made with the founder:
--
--  1. ALLERGIES — removed entirely. Health data (GDPR Art. 9) that powered only
--     a nice-to-have (allergy-aware venue hints, which the neutral `food` field
--     still covers). The field is dropped and any stored values erased — from
--     the column and from profiles_mode.meta.
--
--  2. RELIGION — kept as a voluntary, visible profile field. It stays readable
--     (this migration does NOT restrict it). Its lawful basis is the explicit
--     consent captured by the new privacy-consent gate (columns + RPC below).
--
--  3. DATE OF BIRTH — minimised to age at the exposed surfaces: public_profile_view
--     now exposes a derived `age` and no longer `birthday`, and the events screen
--     reads age instead of DOB, so other users' birth dates are no longer sent to
--     the client or shown. (A deeper hardening — revoking the raw birthday column
--     so it can't be read via the API at all — is prepared separately: it touches
--     the auth/onboarding read paths and needs a device QA pass, so it is not in
--     this data-only migration.)
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · ALLERGIES — erase from meta, then drop the column.
UPDATE public.profiles_mode
   SET meta = meta - 'allergies'
 WHERE meta ? 'allergies';

ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS allergies;

-- 2 · public_profile_view — expose age, not birthday.
--
-- The view can't simply be dropped: public.romance_discover_feed(uuid) (the app's
-- legacy, non-geo discover fallback) is declared RETURNS SETOF this view, so it
-- pins the view's row type and Postgres refuses a plain DROP. Some environments
-- also still carry a superseded private.romance_discover_feed(uuid) that pins it
-- the same way (schema drift — nothing calls it). DROP ... CASCADE clears every
-- such dependent — the same approach the base migration 20250216110000 takes for
-- this exact view. The only dependent that can legitimately exist is the public
-- fallback, which is rebuilt against the new shape below, so the app keeps
-- working — it now returns the derived age instead of birthday, which is the
-- point. The explicit DROP FUNCTIONs are kept so the intent (and the private-
-- schema drift cleanup) stays visible.
DROP FUNCTION IF EXISTS private.romance_discover_feed(uuid);
DROP FUNCTION IF EXISTS public.romance_discover_feed(uuid);

DROP VIEW IF EXISTS public.public_profile_view CASCADE;
CREATE VIEW public.public_profile_view AS
  SELECT
    p.id, p.first_name, p.last_name, p.gender,
    EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int AS age,
    p.city, p.education, p.languages, p.occupation, p.interests,
    p.core_photos, p.main_photo_url, p.instagram, p.created_at, p.updated_at,
    pm.bio AS bio_romance, pm.photos AS romance_photos,
    pm.interests AS romance_interests, pm.meta AS romance_meta
  FROM public.user_profiles p
  LEFT JOIN public.profiles_mode pm ON pm.user_id = p.id AND pm.mode = 'romance';
ALTER VIEW public.public_profile_view SET (security_invoker = on);
GRANT SELECT ON public.public_profile_view TO authenticated;

-- Recreate the legacy non-geo discover fallback against the rebuilt view. Body is
-- unchanged from 20260710140000 (SECURITY INVOKER + auth.uid() self-guard); it
-- selects v.* from the view, so it now returns age, not birthday. Default EXECUTE
-- (PUBLIC) is preserved to match the prior definition; the self-guard protects it.
CREATE FUNCTION public.romance_discover_feed(current_user_id uuid)
RETURNS SETOF public.public_profile_view
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_discover_feed: forbidden' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
    SELECT v.*
    FROM public.public_profile_view v
    INNER JOIN public.profiles_mode pm ON pm.user_id = v.id AND pm.mode = 'romance'
    WHERE v.id IS NOT NULL
      AND v.id != current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.romance_likes rl
        WHERE rl.liker_id = current_user_id AND rl.liked_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = v.id)
           OR (ub.blocker_id = v.id AND ub.blocked_id = current_user_id)
      )
    ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
    LIMIT 100;
END;
$$;

COMMENT ON COLUMN public.user_profiles.birthday IS
  'Exact DOB. Shown to others only as a derived age (via public_profile_view). API-level column lockdown is a prepared follow-up (needs owner-read repoints + QA).';

-- get_my_special_category (from an earlier draft) is not needed: allergies is
-- gone and religion stays readable.
DROP FUNCTION IF EXISTS public.get_my_special_category();

-- 3 · Privacy-consent gate — record of explicit consent.
-- The app must capture explicit agreement to the data-use notice BEFORE any
-- personal data is entered (and explicit consent is the lawful basis for the
-- optional special-category field, religion). These columns record it; the app
-- blocks onboarding until privacy_consent_at is set for the current version.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS privacy_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_consent_version text;

COMMENT ON COLUMN public.users.privacy_consent_at IS
  'When the user accepted the data-use notice. NULL = not yet consented; the app blocks personal-data entry until set.';
COMMENT ON COLUMN public.users.privacy_consent_version IS
  'Which notice version was accepted, so a materially changed notice can require re-consent.';

CREATE OR REPLACE FUNCTION public.record_privacy_consent(p_version text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_privacy_consent: not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_version IS NULL OR length(trim(p_version)) = 0 THEN
    RAISE EXCEPTION 'record_privacy_consent: version required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.users
     SET privacy_consent_at = now(), privacy_consent_version = p_version
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_privacy_consent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_privacy_consent(text) TO authenticated;

COMMENT ON FUNCTION public.record_privacy_consent(text) IS
  'Stamps the calling user''s privacy-consent acceptance (server-side now(), owner-only).';
