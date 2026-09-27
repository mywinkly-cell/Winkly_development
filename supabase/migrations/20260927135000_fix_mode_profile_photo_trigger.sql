-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: saving a Romance / Friends / Business profile always failed.
--
-- 20260922120000_media_moderation.sql attached enforce_moderated_profile_photos()
-- to profiles_core, user_profiles, sub_profiles and profiles_mode. Its final check
-- was one AND-chain starting `TG_TABLE_NAME = 'user_profiles' AND NEW.main_photo_url
-- ...`. PL/pgSQL resolves every NEW.<field> in an expression before evaluating it,
-- so on sub_profiles / profiles_mode (no main_photo_url column) every client INSERT
-- (onboarding's upserts) and every photos UPDATE raised
--   record "new" has no field "main_photo_url".
-- Found while writing supabase/tests/security_audit_2026_09_test.sql, which now
-- covers it. Same logic, with the user_profiles-only part nested.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_moderated_profile_photos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_user UUID;
  v_new  TEXT[];
  v_old  TEXT[] := '{}';
  v_url  TEXT;
BEGIN
  -- Service role (moderate-media promotion/takedown), migrations and definer jobs.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('profiles_core', 'user_profiles') THEN
    v_user := NEW.id;
    v_new := COALESCE(NEW.core_photos, '{}');
    IF TG_OP = 'UPDATE' THEN v_old := COALESCE(OLD.core_photos, '{}'); END IF;
  ELSE
    v_user := NEW.user_id;
    v_new := COALESCE(NEW.photos, '{}');
    IF TG_OP = 'UPDATE' THEN v_old := COALESCE(OLD.photos, '{}'); END IF;
  END IF;

  FOREACH v_url IN ARRAY v_new LOOP
    CONTINUE WHEN v_url IS NULL OR v_url = ANY (v_old);
    IF NOT private.profile_photo_allowed(v_user, v_url) THEN
      RAISE EXCEPTION 'photo_not_moderated: this photo has not passed review yet'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- main_photo_url is client-writable too: it must be one of the (checked) photos
  -- or itself pass the gate.
  -- Nested, not AND-ed: PL/pgSQL resolves every NEW.<field> in one expression up
  -- front, so referencing main_photo_url on a table without that column fails even
  -- when TG_TABLE_NAME = 'user_profiles' is false.
  IF TG_TABLE_NAME = 'user_profiles' THEN
    IF NEW.main_photo_url IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.main_photo_url IS DISTINCT FROM OLD.main_photo_url)
       AND NOT (NEW.main_photo_url = ANY (v_new))
       AND NOT private.profile_photo_allowed(v_user, NEW.main_photo_url) THEN
      RAISE EXCEPTION 'photo_not_moderated: this photo has not passed review yet'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
