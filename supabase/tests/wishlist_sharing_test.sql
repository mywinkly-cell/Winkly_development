-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test: wishlist sharing (20260927120000_wishlist_sharing.sql) and the
-- events catalogue tables (20260927121000_…_sponsored_offers_and_place_photos.sql).
--
-- Plays the database as a signed-in user would, including trying to read what they
-- must not see. Needs 3 rows in auth.users (supabase/seed.sql provides them).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/wishlist_sharing_test.sql
--
-- Runs in a transaction and ROLLBACKs. Failures RAISE EXCEPTION; passes print NOTICEs.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

SELECT set_config('test.a', (SELECT id::text FROM auth.users ORDER BY created_at, id LIMIT 1), false);
SELECT set_config('test.b', (SELECT id::text FROM auth.users ORDER BY created_at, id OFFSET 1 LIMIT 1), false);
SELECT set_config('test.c', (SELECT id::text FROM auth.users ORDER BY created_at, id OFFSET 2 LIMIT 1), false);

DO $$
BEGIN
  IF COALESCE(current_setting('test.c', true), '') = '' THEN
    RAISE EXCEPTION 'This test needs at least three rows in auth.users';
  END IF;
END $$;

-- Fixtures (as postgres): A and B share a romance chat; A and C share a business chat.
INSERT INTO public.conversations (id, type, mode, created_by)
VALUES ('00000000-0000-4000-8000-00000000a001', 'dm', 'romance', current_setting('test.a')::uuid),
       ('00000000-0000-4000-8000-00000000a002', 'dm', 'business', current_setting('test.a')::uuid);
INSERT INTO public.conversation_members (conversation_id, user_id)
VALUES ('00000000-0000-4000-8000-00000000a001', current_setting('test.a')::uuid),
       ('00000000-0000-4000-8000-00000000a001', current_setting('test.b')::uuid),
       ('00000000-0000-4000-8000-00000000a002', current_setting('test.a')::uuid),
       ('00000000-0000-4000-8000-00000000a002', current_setting('test.c')::uuid);

INSERT INTO public.wishlist_items (id, user_id, title, mode, shared_modes)
VALUES ('00000000-0000-4000-8000-00000000b001', current_setting('test.a')::uuid, 'Rooftop bar (shared for dates)', 'romance', '{romance}'),
       ('00000000-0000-4000-8000-00000000b002', current_setting('test.a')::uuid, 'Private idea', 'romance', '{}');

-- ── As B (A's romance match) ─────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_shared_wishlist_items(ARRAY[current_setting('test.a')::uuid], 'romance');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: match should see exactly the 1 romance-shared item, saw %', n; END IF;
  RAISE NOTICE 'PASS: a romance match sees the item shared for dates, not the private one';

  SELECT count(*) INTO n FROM public.get_shared_wishlist_items(ARRAY[current_setting('test.a')::uuid], 'business');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: romance match must not see items via another mode, saw %', n; END IF;
  RAISE NOTICE 'PASS: sharing does not leak across modes';

  SELECT count(*) INTO n FROM public.wishlist_items WHERE user_id = current_setting('test.a')::uuid;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: direct table read exposed % of another user''s wishlist rows', n; END IF;
  RAISE NOTICE 'PASS: other users'' wishlist rows stay unreadable through the table';
END $$;

-- ── As C (A's business contact) ──────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_shared_wishlist_items(ARRAY[current_setting('test.a')::uuid], 'romance');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: business contact read % romance-shared items', n; END IF;
  SELECT count(*) INTO n FROM public.get_shared_wishlist_items(ARRAY[current_setting('test.a')::uuid], 'business');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: business contact saw % items nobody shared for business', n; END IF;
  RAISE NOTICE 'PASS: a contact in another mode sees nothing';
END $$;

-- ── A shares the whole list for business → C now sees both open items ────────
RESET ROLE;
INSERT INTO public.wishlist_sharing_settings (user_id, share_all_modes)
VALUES (current_setting('test.a')::uuid, '{business}');
SET LOCAL ROLE authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_shared_wishlist_items(ARRAY[current_setting('test.a')::uuid], 'business');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: whole-list sharing should expose 2 items to the business contact, saw %', n; END IF;
  RAISE NOTICE 'PASS: whole-list sharing applies to every item in that mode';
END $$;

-- ── Blocking hides everything ────────────────────────────────────────────────
RESET ROLE;
INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES (current_setting('test.a')::uuid, current_setting('test.c')::uuid);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_shared_wishlist_items(ARRAY[current_setting('test.a')::uuid], 'business');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a blocked user still sees % shared items', n; END IF;
  RAISE NOTICE 'PASS: blocking hides shared items';
END $$;

-- ── Another user's sharing settings are unreadable and unwritable ────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.wishlist_sharing_settings;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: read % other users'' sharing settings', n; END IF;
  BEGIN
    INSERT INTO public.wishlist_sharing_settings (user_id, share_all_modes)
    VALUES (current_setting('test.a')::uuid, '{romance}');
    RAISE EXCEPTION 'FAIL: wrote another user''s sharing settings';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cannot write another user''s sharing settings';
  END;
END $$;

-- ── The internal helper is not callable by clients ───────────────────────────
DO $$
BEGIN
  BEGIN
    PERFORM private.wishlist_share_visible(current_setting('test.c')::uuid, current_setting('test.a')::uuid, 'romance');
    RAISE EXCEPTION 'FAIL: clients can call private.wishlist_share_visible';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: private.wishlist_share_visible is service-role only';
  END;
END $$;

-- ── Sponsored offers: only live rows are visible; users cannot write them ────
RESET ROLE;
INSERT INTO public.sponsored_venue_offers (id, venue_name, title, city, active, starts_at, ends_at)
VALUES ('00000000-0000-4000-8000-00000000c001', 'Live Bar', 'Happy hour', 'München', true, now() - interval '1 day', now() + interval '1 day'),
       ('00000000-0000-4000-8000-00000000c002', 'Paused Bar', 'Paused', 'München', false, now() - interval '1 day', NULL),
       ('00000000-0000-4000-8000-00000000c003', 'Expired Bar', 'Old', 'München', true, now() - interval '10 day', now() - interval '1 day');
SET LOCAL ROLE authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.sponsored_venue_offers;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: expected only the 1 live sponsored offer, saw %', n; END IF;
  RAISE NOTICE 'PASS: only active, in-window sponsored offers are visible';

  BEGIN
    UPDATE public.sponsored_venue_offers SET weight = 100 WHERE id = '00000000-0000-4000-8000-00000000c001';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'FAIL: a user boosted a sponsored offer'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS: users cannot edit sponsored offers';

  INSERT INTO public.sponsored_offer_events (offer_id, kind) VALUES ('00000000-0000-4000-8000-00000000c001', 'impression');
  RAISE NOTICE 'PASS: a user can record their own impression';

  BEGIN
    INSERT INTO public.sponsored_offer_events (offer_id, user_id, kind)
    VALUES ('00000000-0000-4000-8000-00000000c001', current_setting('test.a')::uuid, 'tap');
    RAISE EXCEPTION 'FAIL: recorded a tap on behalf of another user';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cannot record events for someone else';
  END;

  BEGIN
    SELECT count(*) INTO n FROM public.sponsored_offer_events;
    RAISE EXCEPTION 'FAIL: clients can read sponsored offer analytics';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: sponsored analytics are not readable by clients';
  END;

  BEGIN
    SELECT count(*) INTO n FROM public.place_lookup_cache;
    RAISE EXCEPTION 'FAIL: clients can read place_lookup_cache';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: place_lookup_cache is service-role only';
  END;
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '─── all wishlist sharing / catalogue assertions passed ───'; END $$;

ROLLBACK;
