-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test for the August 2026 security audit.
--
-- Every assertion below corresponds to a hole that was open in production and
-- is closed by 20260821120000_security_hardening_audit_v1_48.sql. They all
-- survived four documented audit cycles because nothing exercised the database
-- as an attacker would — which is the actual point of this file.
--
--   SEC-1  a user could PATCH their own subscription_tier to 'enterprise',
--          restore their own users.status after a ban, and clear their own
--          invite_sending_suspended_until
--   SEC-2  any authenticated user could read every romance-mode user's stored
--          coordinates straight out of user_locations
--   SEC-3  any authenticated user could rewrite any companies /
--          business_services row
--   SEC-5  anon (the key shipped inside the app bundle) could execute
--          match_events_for_concierge
--   SAFE-1 any date of birth could be written directly, including an under-18 one
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening_test.sql
--   (or paste into the Supabase SQL editor)
--
-- Requires at least one row in auth.users. Runs inside a transaction and
-- ROLLBACKs — nothing is left behind, including the tier changes it attempts.
-- A failing assertion RAISEs EXCEPTION; successes print NOTICE 'PASS:' lines.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

SELECT set_config('test.user_a', (SELECT id::text FROM auth.users ORDER BY created_at, id LIMIT 1), false);
SELECT set_config('test.user_b',
  COALESCE((SELECT id::text FROM auth.users
     WHERE id <> current_setting('test.user_a')::uuid
     ORDER BY created_at, id LIMIT 1), ''), false);

DO $$
BEGIN
  IF COALESCE(current_setting('test.user_a', true), '') = '' THEN
    RAISE EXCEPTION 'This test needs at least one row in auth.users';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-1 · billing and moderation columns on public.users
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  -- Self-upgrade to a paid tier.
  BEGIN
    UPDATE public.users
       SET subscription_tier = 'enterprise', premium_until = now() + interval '10 years'
     WHERE id = current_setting('test.user_a')::uuid;
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-1): a user was able to set their own subscription_tier';
  END IF;
  RAISE NOTICE 'PASS: self-upgrade to a paid tier is blocked';
END $$;

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  -- Undo a ban.
  BEGIN
    UPDATE public.users SET status = 'active'
     WHERE id = current_setting('test.user_a')::uuid;
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-1): a user was able to rewrite their own users.status';
  END IF;
  RAISE NOTICE 'PASS: self-unban via users.status is blocked';
END $$;

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  -- Clear an anti-spam suspension (enforced in business_connections_v1.sql:174).
  BEGIN
    UPDATE public.users SET invite_sending_suspended_until = NULL
     WHERE id = current_setting('test.user_a')::uuid;
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-1): a user was able to clear their own invite suspension';
  END IF;
  RAISE NOTICE 'PASS: self-clearing an invite suspension is blocked';
END $$;

DO $$
DECLARE
  v_type text;
BEGIN
  -- The one column a user legitimately owns must still be writable, or the
  -- account-type switch in the app breaks.
  SELECT account_type::text INTO v_type FROM public.users
   WHERE id = current_setting('test.user_a')::uuid;

  UPDATE public.users
     SET account_type = (CASE WHEN v_type = 'business' THEN 'personal' ELSE 'business' END)::account_type
   WHERE id = current_setting('test.user_a')::uuid;

  RAISE NOTICE 'PASS: account_type is still writable by its owner';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SEC-1): account_type became unwritable — accountTypeSwitch.ts is broken. %', SQLERRM;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-2 · another user's coordinates
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_visible int;
BEGIN
  SELECT count(*) INTO v_visible
    FROM public.user_locations
   WHERE user_id <> current_setting('test.user_a')::uuid;

  IF v_visible > 0 THEN
    RAISE EXCEPTION
      'FAIL (SEC-2): % other users'' location rows are readable. user_locations must be owner-only.',
      v_visible;
  END IF;
  RAISE NOTICE 'PASS: no other user''s coordinates are readable';
END $$;

DO $$
BEGIN
  -- The feed must still work; it returns a rounded distance, never a point.
  PERFORM public.romance_discover_feed_geo(
    current_setting('test.user_a')::uuid, 50, 18, 99, NULL, 5);
  RAISE NOTICE 'PASS: romance_discover_feed_geo is still callable';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SEC-2): the discover feed broke — %', SQLERRM;
END $$;

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  -- And it must refuse to run on behalf of someone else.
  IF COALESCE(current_setting('test.user_b', true), '') = '' THEN
    RAISE NOTICE 'SKIP: no second user available for the impersonation case';
    RETURN;
  END IF;
  BEGIN
    PERFORM public.romance_discover_feed_geo(
      current_setting('test.user_b')::uuid, 50, 18, 99, NULL, 5);
    v_blocked := false;
  EXCEPTION WHEN others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-2): the discover feed ran for a different user_id';
  END IF;
  RAISE NOTICE 'PASS: the discover feed refuses to run as another user';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-3 · business catalogue is read-only for clients
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  BEGIN
    UPDATE public.companies SET name = 'defaced-by-test';
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-3): companies rows are writable by any authenticated user';
  END IF;
  RAISE NOTICE 'PASS: companies is read-only for clients';
END $$;

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  BEGIN
    UPDATE public.business_services SET title = 'defaced-by-test';
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-3): business_services rows are writable by any authenticated user';
  END IF;
  RAISE NOTICE 'PASS: business_services is read-only for clients';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SAFE-1 · 18+ floor
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  BEGIN
    UPDATE public.user_profiles
       SET birthday = CURRENT_DATE - INTERVAL '14 years'
     WHERE id = current_setting('test.user_a')::uuid;
    v_blocked := false;
  EXCEPTION WHEN check_violation OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SAFE-1): an under-18 date of birth was accepted';
  END IF;
  RAISE NOTICE 'PASS: an under-18 date of birth is rejected';
END $$;

DO $$
BEGIN
  UPDATE public.user_profiles
     SET birthday = CURRENT_DATE - INTERVAL '25 years'
   WHERE id = current_setting('test.user_a')::uuid;
  RAISE NOTICE 'PASS: an adult date of birth is still accepted';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SAFE-1): a valid adult date of birth was rejected — %', SQLERRM;
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-5 · anon cannot run the event search
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  BEGIN
    PERFORM public.match_events_for_concierge('Munich', 'test', now(), now() + interval '7 days', 5);
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-5): anon can still execute match_events_for_concierge';
  END IF;
  RAISE NOTICE 'PASS: anon cannot execute match_events_for_concierge';
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '─── all security regression assertions passed ───'; END $$;

ROLLBACK;
