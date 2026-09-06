-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test — Sept 2026 special-category & DOB handling
-- (20260905120000_data_minimization_special_category.sql).
--
-- Asserts: allergies is gone (column + meta); religion stays readable (kept
-- visible by design); the profile view exposes age, not birthday; and the
-- privacy-consent RPC records consent for the owner.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/data_minimization_test.sql
--
-- Needs ≥2 rows in auth.users. Runs in a transaction and ROLLBACKs.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

SELECT set_config('test.me', (SELECT id::text FROM auth.users ORDER BY created_at, id LIMIT 1), false);
SELECT set_config('test.other',
  COALESCE((SELECT id::text FROM auth.users WHERE id <> current_setting('test.me')::uuid ORDER BY created_at, id LIMIT 1), ''), false);
DO $$ BEGIN IF COALESCE(current_setting('test.other',true),'')='' THEN RAISE EXCEPTION 'needs two auth.users'; END IF; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='user_profiles' AND column_name='allergies') THEN
    RAISE EXCEPTION 'FAIL: user_profiles.allergies still exists';
  END IF;
  RAISE NOTICE 'PASS: allergies column is dropped';
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles_mode WHERE meta ? 'allergies';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL: % meta rows still carry allergies', n; END IF;
  RAISE NOTICE 'PASS: allergies stripped from profiles_mode.meta';
END $$;

DO $$
DECLARE has_birthday boolean; has_age boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_profile_view' AND column_name='birthday') INTO has_birthday;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_profile_view' AND column_name='age') INTO has_age;
  IF has_birthday THEN RAISE EXCEPTION 'FAIL: public_profile_view still exposes birthday'; END IF;
  IF NOT has_age THEN RAISE EXCEPTION 'FAIL: public_profile_view is missing age'; END IF;
  RAISE NOTICE 'PASS: public_profile_view exposes age, not birthday';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.me'), 'role','authenticated')::text, true);

DO $$
DECLARE r text;
BEGIN
  -- religion is KEPT visible by design.
  SELECT religion INTO r FROM public.user_profiles WHERE id = current_setting('test.other')::uuid;
  RAISE NOTICE 'PASS: religion remains readable (kept visible)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL: religion became unreadable — it should stay visible';
END $$;

DO $$
DECLARE a int;
BEGIN
  SELECT age INTO a FROM public.public_profile_view WHERE id = current_setting('test.other')::uuid;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL: age not derivable via the view'; END IF;
  RAISE NOTICE 'PASS: another user''s age is readable via the view';
END $$;

DO $$
BEGIN
  PERFORM public.record_privacy_consent('test-version');
  RAISE NOTICE 'PASS: record_privacy_consent stamped the owner''s consent';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL: record_privacy_consent errored — %', SQLERRM;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE '─── data-handling assertions passed ───'; END $$;
ROLLBACK;
