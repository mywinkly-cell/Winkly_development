-- ─────────────────────────────────────────────────────────────────────────────
-- September 2026 security audit — SEC-12: last names follow the user's choice.
-- Regression test: supabase/tests/security_audit_2026_09_test.sql
--
-- `show_full_name` ("show my full name") was enforced only in the app: every
-- authenticated user could read every user's last_name from user_profiles, the
-- profile views and the romance RPCs.
--
-- Product rule (founder, Sept 2026):
--   • Romance, Friends and Events: first name only, unless the user opts in.
--   • Business profiles always show the full name (professional networking).
--   • Hosting an event shows the host's full name.
-- So another user's last name is visible when show_full_name is on, OR the user
-- has a Business profile, OR hosts at least one event.
--
-- How:
--   • user_profiles.last_name_public — maintained by triggers: the last name when
--     the rule above allows it, else NULL. Other users read THIS column.
--   • The owner reads their own row through the new public.my_profile view.
--   • PHASE 2 (supabase/scripts/last_name_lockdown_phase2.sql, after the app
--     update ships): the real last_name joins birthday as owner-only.
--   • public_profile_view, friend_profiles and the romance RPCs return the masked
--     value under the same `last_name` name, so their callers don't change.
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_name_public text;

COMMENT ON COLUMN public.user_profiles.last_name_public IS
  'Last name as other users may see it: last_name when show_full_name is on, the user has a Business profile or hosts an event; otherwise NULL. Maintained by triggers — never written by clients.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Rule + maintenance
-- ═════════════════════════════════════════════════════════════════════════════

-- Business profile or hosted event (the parts of the rule that live outside the row).
CREATE OR REPLACE FUNCTION private.last_name_required_public(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles_mode WHERE user_id = p_user AND mode = 'business')
      OR EXISTS (SELECT 1 FROM public.sub_profiles  WHERE user_id = p_user AND mode = 'business')
      OR EXISTS (SELECT 1 FROM public.events        WHERE created_by = p_user);
$$;
REVOKE ALL ON FUNCTION private.last_name_required_public(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_profiles_set_last_name_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  NEW.last_name_public := CASE
    WHEN NEW.show_full_name IS TRUE OR private.last_name_required_public(NEW.id) THEN NEW.last_name
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_last_name_public ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_last_name_public
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_set_last_name_public();

-- Re-evaluates one user after a Business profile or hosted event appears/disappears.
CREATE OR REPLACE FUNCTION private.refresh_last_name_public(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
AS $$
  UPDATE public.user_profiles
     SET last_name_public = CASE
           WHEN show_full_name IS TRUE OR private.last_name_required_public(id) THEN last_name
           ELSE NULL
         END
   WHERE id = p_user;
$$;
REVOKE ALL ON FUNCTION private.refresh_last_name_public(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_last_name_public_from_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.mode = 'business' THEN
    PERFORM private.refresh_last_name_public(NEW.user_id);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.mode = 'business' THEN
    PERFORM private.refresh_last_name_public(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_mode_last_name_public ON public.profiles_mode;
CREATE TRIGGER trg_profiles_mode_last_name_public
  AFTER INSERT OR UPDATE OF mode OR DELETE ON public.profiles_mode
  FOR EACH ROW EXECUTE FUNCTION public.refresh_last_name_public_from_mode();

DROP TRIGGER IF EXISTS trg_sub_profiles_last_name_public ON public.sub_profiles;
CREATE TRIGGER trg_sub_profiles_last_name_public
  AFTER INSERT OR UPDATE OF mode OR DELETE ON public.sub_profiles
  FOR EACH ROW EXECUTE FUNCTION public.refresh_last_name_public_from_mode();

CREATE OR REPLACE FUNCTION public.refresh_last_name_public_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM private.refresh_last_name_public(NEW.created_by);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    PERFORM private.refresh_last_name_public(OLD.created_by);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_last_name_public ON public.events;
CREATE TRIGGER trg_events_last_name_public
  AFTER INSERT OR UPDATE OF created_by OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.refresh_last_name_public_from_event();

-- Backfill.
UPDATE public.user_profiles
   SET last_name_public = CASE
         WHEN show_full_name IS TRUE OR private.last_name_required_public(id) THEN last_name
         ELSE NULL
       END;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Grants
--    PHASE 1 (this migration): other users can read last_name_public. The raw
--    last_name stays readable for now so app versions already on phones keep
--    working. PHASE 2 — supabase/scripts/last_name_lockdown_phase2.sql — removes
--    last_name from the grant once the app update that reads last_name_public /
--    my_profile has shipped (docs/SECURITY_AUDIT_2026_09.md).
-- ═════════════════════════════════════════════════════════════════════════════

-- The authenticated grant is an explicit column list (birthday lockdown), so a new
-- column is not readable until granted.
GRANT SELECT (last_name_public) ON public.user_profiles TO authenticated;
REVOKE INSERT (last_name_public), UPDATE (last_name_public) ON public.user_profiles FROM anon, authenticated;

-- The owner's own row, every column (profile edit, onboarding, routing checks).
-- A definer view on purpose: it reads the owner-only columns, and the WHERE
-- clause limits it to the caller's own row.
DROP VIEW IF EXISTS public.my_profile;
CREATE VIEW public.my_profile WITH (security_barrier = true) AS
  SELECT * FROM public.user_profiles WHERE id = auth.uid();
COMMENT ON VIEW public.my_profile IS
  'The caller''s own user_profiles row with owner-only columns (last_name, birthday). Read-only; write to user_profiles.';
REVOKE ALL ON public.my_profile FROM PUBLIC, anon;
GRANT SELECT ON public.my_profile TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Views and RPCs return the masked value under the same name
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.public_profile_view AS
  SELECT
    p.id, p.first_name, p.last_name_public AS last_name, p.gender,
    public._age_from_uid(p.id) AS age,
    p.city, p.education, p.languages, p.occupation, p.interests,
    p.core_photos, p.main_photo_url, p.instagram, p.created_at, p.updated_at,
    pm.bio AS bio_romance, pm.photos AS romance_photos,
    pm.interests AS romance_interests, pm.meta AS romance_meta,
    -- Appended (CREATE OR REPLACE VIEW can only add at the end). The app needs it to
    -- decide first-name-only vs full name per mode; 20260905120000 dropped it, which
    -- broke app/(tabs)/planner/dates.tsx (it selects show_full_name from this view).
    p.show_full_name
  FROM public.user_profiles p
  LEFT JOIN public.profiles_mode pm ON pm.user_id = p.id AND pm.mode = 'romance';
ALTER VIEW public.public_profile_view SET (security_invoker = on);

-- friend_profiles and the romance RPCs: rewrite user_profiles.last_name (alias p)
-- to last_name_public in place, keeping every other part of the live definition.
DO $$
DECLARE
  v_def text;
  v_sig text;
BEGIN
  IF to_regclass('public.friend_profiles') IS NOT NULL THEN
    v_def := pg_get_viewdef('public.friend_profiles'::regclass);
    v_def := regexp_replace(v_def, '\mp\.last_name\M(\s*,)', 'p.last_name_public AS last_name\1');
    v_def := regexp_replace(v_def, '\mp\.last_name\M', 'p.last_name_public', 'g');
    -- Latent bug from 20260906120000 (birthday lockdown): friend_profiles still
    -- derived age from p.birthday, which clients can no longer read, so every
    -- client read of this view failed with "permission denied". Use the same
    -- DEFINER age helper public_profile_view uses.
    v_def := replace(
      v_def,
      '(EXTRACT(year FROM age((COALESCE(p.birthday, ''2000-01-01''::date))::timestamp with time zone)))::integer',
      'public._age_from_uid(p.id)'
    );
    IF v_def ~ '\mp\.birthday\M' THEN
      RAISE EXCEPTION 'last-name-privacy: friend_profiles still reads p.birthday — update this migration for the live definition';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.friend_profiles AS ' || v_def;
    -- CREATE OR REPLACE VIEW resets reloptions; without this the view would run as
    -- its owner and skip user_profiles RLS (e.g. the blocked-users filter).
    ALTER VIEW public.friend_profiles SET (security_invoker = on);
  END IF;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.romance_new_matches(uuid)',
    'public.romance_likes_received(uuid)',
    'public.romance_pending_chat_invites(uuid)',
    'public.romance_liked_profiles(uuid)',
    'private.decline_romance_chat_invite(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'last-name-privacy: % not found, skipping', v_sig;
      CONTINUE;
    END IF;
    v_def := pg_get_functiondef(v_sig::regprocedure);
    IF v_def ~ '\mp\.last_name\M' THEN
      EXECUTE regexp_replace(v_def, '\mp\.last_name\M', 'p.last_name_public', 'g');
    END IF;
  END LOOP;
END $$;
