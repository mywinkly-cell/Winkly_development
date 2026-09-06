-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test — birthday column lockdown (20260906120000).
-- Other users can no longer read the raw birthday column; age still works
-- everywhere; the owner reads their own DOB.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/birthday_lockdown_test.sql
--
-- Needs ≥2 rows in auth.users. Runs in a transaction and ROLLBACKs.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

SELECT set_config('test.me', (SELECT id::text FROM auth.users ORDER BY created_at, id LIMIT 1), false);
SELECT set_config('test.other',
  COALESCE((SELECT id::text FROM auth.users WHERE id <> current_setting('test.me')::uuid ORDER BY created_at, id LIMIT 1), ''), false);
DO $$ BEGIN IF COALESCE(current_setting('test.other',true),'')='' THEN RAISE EXCEPTION 'needs two auth.users'; END IF; END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.me'), 'role','authenticated')::text, true);

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    PERFORM birthday FROM public.user_profiles WHERE id = current_setting('test.other')::uuid;
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL: another user''s birthday is still readable off the table'; END IF;
  RAISE NOTICE 'PASS: another user''s birthday is not readable';
END $$;

DO $$
DECLARE v_name text;
BEGIN
  SELECT first_name INTO v_name FROM public.user_profiles WHERE id = current_setting('test.other')::uuid;
  RAISE NOTICE 'PASS: ordinary columns still readable cross-user';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL: first_name became unreadable — the re-grant dropped a needed column';
END $$;

DO $$
DECLARE a int;
BEGIN
  SELECT age INTO a FROM public.public_profile_view WHERE id = current_setting('test.other')::uuid;
  IF a IS NULL THEN RAISE EXCEPTION 'FAIL: age not derivable via public_profile_view'; END IF;
  RAISE NOTICE 'PASS: age readable via public_profile_view (helper)';
END $$;

DO $$
DECLARE d date;
BEGIN
  SELECT public.get_my_birthday() INTO d;
  RAISE NOTICE 'PASS: owner reads own birthday via get_my_birthday()';
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE '─── birthday-lockdown assertions passed ───'; END $$;
ROLLBACK;
