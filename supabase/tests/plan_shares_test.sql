-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test: shareable plan links + web RSVP (20261009120000_plan_shares_web_rsvp.sql).
--
-- Plays the host, a friend with the app, a friend without it (anon web page) and a stranger:
-- token states (valid / expired / revoked / max uses), RSVP rate limits, conversion to a
-- normal participant, and that the public read path never leaks private fields.
-- Needs 3 rows in auth.users (supabase/seed.sql provides them).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_shares_test.sql
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

-- ── Fixtures (as postgres) ───────────────────────────────────────────────────
-- A is the host; B has an older confirmed account; C will "sign up" after answering on the web.
UPDATE auth.users SET email = 'host-a@winkly.test', email_confirmed_at = now(), created_at = now() - INTERVAL '30 days'
 WHERE id = current_setting('test.a')::uuid;
UPDATE auth.users SET email = 'friend-b@winkly.test', email_confirmed_at = now(), created_at = now() - INTERVAL '20 days'
 WHERE id = current_setting('test.b')::uuid;
UPDATE auth.users SET email = 'stranger-c@winkly.test', email_confirmed_at = now(), created_at = now() - INTERVAL '10 days'
 WHERE id = current_setting('test.c')::uuid;
DELETE FROM public.user_blocks
 WHERE blocker_id IN (current_setting('test.a')::uuid, current_setting('test.b')::uuid, current_setting('test.c')::uuid);

DO $$
BEGIN
  UPDATE public.user_profiles
     SET first_name = 'Alexa Marie', last_name = 'Zebrowski-Secret', main_photo_url = 'https://cdn.test/alexa.jpg'
   WHERE id = current_setting('test.a')::uuid;
  IF NOT FOUND THEN
    INSERT INTO public.user_profiles (id, first_name, last_name, main_photo_url)
    VALUES (current_setting('test.a')::uuid, 'Alexa Marie', 'Zebrowski-Secret', 'https://cdn.test/alexa.jpg');
  END IF;
END $$;

INSERT INTO public.planner_items (id, created_by, source_mode, title, description, starts_at, meta)
VALUES
  ('00000000-0000-4000-8000-0000000c0001', current_setting('test.a')::uuid, 'friends', 'Sunset picnic',
   'Door code 4711, bring the spare key', now() + INTERVAL '2 days',
   '{"location": "Leopoldstraße 12, 80802 München, Germany", "place_id": "ChIJsecret"}'::jsonb),
  ('00000000-0000-4000-8000-0000000c0002', current_setting('test.a')::uuid, 'friends', 'Board games',
   'Why it fits: you both love strategy games', now() + INTERVAL '3 days',
   '{"from_concierge": true, "area": "Schwabing"}'::jsonb),
  ('00000000-0000-4000-8000-0000000c0003', current_setting('test.a')::uuid, 'friends', 'Climbing',
   NULL, now() + INTERVAL '4 days', '{}'::jsonb);
INSERT INTO public.planner_participants (planner_item_id, user_id, role)
VALUES ('00000000-0000-4000-8000-0000000c0001', current_setting('test.a')::uuid, 'owner'),
       ('00000000-0000-4000-8000-0000000c0002', current_setting('test.a')::uuid, 'owner'),
       ('00000000-0000-4000-8000-0000000c0003', current_setting('test.a')::uuid, 'owner');

-- ── As A (host): create + reuse links ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.a'), 'role', 'authenticated')::text, true);

DO $$
DECLARE s1 public.plan_shares; s2 public.plan_shares; s3 public.plan_shares; s4 public.plan_shares;
BEGIN
  s1 := public.create_plan_share('00000000-0000-4000-8000-0000000c0001', 'Europe/Vienna');
  IF s1.token !~ '^[A-Za-z0-9_-]{24}$' THEN RAISE EXCEPTION 'FAIL: unexpected token format %', s1.token; END IF;
  IF s1.expires_at <> s1.created_at + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'FAIL: default expiry should be 7 days, got %', s1.expires_at - s1.created_at;
  END IF;
  s2 := public.create_plan_share('00000000-0000-4000-8000-0000000c0001');
  IF s2.id <> s1.id THEN RAISE EXCEPTION 'FAIL: an active link should be reused, not duplicated'; END IF;
  RAISE NOTICE 'PASS: host creates a 7-day link and re-sharing reuses it';

  s3 := public.create_plan_share('00000000-0000-4000-8000-0000000c0002');
  s4 := public.create_plan_share('00000000-0000-4000-8000-0000000c0003');
  PERFORM set_config('test.tok1', s1.token, false);
  PERFORM set_config('test.share1', s1.id::text, false);
  PERFORM set_config('test.tok2', s3.token, false);
  PERFORM set_config('test.share2', s3.id::text, false);
  PERFORM set_config('test.tok3', s4.token, false);
  PERFORM set_config('test.share3', s4.id::text, false);
END $$;

DO $$
BEGIN
  UPDATE public.plan_shares SET use_count = 0 WHERE id = current_setting('test.share1')::uuid;
  RAISE EXCEPTION 'FAIL: client could write use_count';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: use_count is not client-writable';
END $$;

DO $$
BEGIN
  UPDATE public.plan_shares SET token = 'aaaaaaaaaaaaaaaaaaaaaaaa' WHERE id = current_setting('test.share1')::uuid;
  RAISE EXCEPTION 'FAIL: client could choose the token';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: token is not client-writable';
END $$;

-- ── As B: other people's links stay private ──────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plan_shares;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: B can read % of A''s share rows', n; END IF;
  RAISE NOTICE 'PASS: plan_shares is owner-only';

  BEGIN
    PERFORM public.create_plan_share('00000000-0000-4000-8000-0000000c0001');
    RAISE EXCEPTION 'FAIL: B created a link for A''s plan';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: only the plan''s creator can share it';
  END;

  IF public.revoke_plan_share(current_setting('test.share1')::uuid) THEN
    RAISE EXCEPTION 'FAIL: B revoked A''s link';
  END IF;
  RAISE NOTICE 'PASS: only the owner can revoke a link';
END $$;

-- ── As anon (the web page): public read path ─────────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT set_config('request.headers', '{"x-forwarded-for": "198.51.100.1, 10.0.0.1"}', true);

DO $$
DECLARE r jsonb; txt text;
BEGIN
  r := public.get_shared_plan(current_setting('test.tok1'));
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'FAIL: valid token → %', r; END IF;
  IF r->'plan'->>'title' <> 'Sunset picnic' THEN RAISE EXCEPTION 'FAIL: title missing: %', r; END IF;
  IF r->'plan'->>'neighbourhood' <> 'München, Germany' THEN
    RAISE EXCEPTION 'FAIL: neighbourhood should be "München, Germany", got %', r->'plan'->>'neighbourhood';
  END IF;
  IF r->'plan'->'host'->>'first_name' <> 'Alexa' THEN RAISE EXCEPTION 'FAIL: host first name: %', r; END IF;
  IF r->'plan'->'host'->>'photo_url' <> 'https://cdn.test/alexa.jpg' THEN RAISE EXCEPTION 'FAIL: host photo: %', r; END IF;
  IF r->'plan' ? 'starts_at' IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: day/time missing'; END IF;
  IF r->'plan'->>'time_zone' <> 'Europe/Vienna' THEN RAISE EXCEPTION 'FAIL: host time zone missing: %', r; END IF;

  txt := r::text;
  IF txt ILIKE '%Zebrowski%' OR txt ILIKE '%Marie%' THEN RAISE EXCEPTION 'FAIL: last/middle name leaked: %', txt; END IF;
  IF txt ILIKE '%Leopold%' OR txt LIKE '%80802%' OR txt LIKE '% 12%' THEN RAISE EXCEPTION 'FAIL: exact address leaked: %', txt; END IF;
  IF txt ILIKE '%ChIJ%' THEN RAISE EXCEPTION 'FAIL: place id leaked: %', txt; END IF;
  IF txt ILIKE '%4711%' OR txt ILIKE '%spare key%' THEN RAISE EXCEPTION 'FAIL: host notes leaked: %', txt; END IF;
  IF txt ILIKE '%@%' THEN RAISE EXCEPTION 'FAIL: an email leaked: %', txt; END IF;
  IF txt ILIKE '%birthday%' OR txt ILIKE '%"age"%' OR txt ILIKE '%last_name%' OR txt ILIKE '%created_by%' THEN
    RAISE EXCEPTION 'FAIL: private field leaked: %', txt;
  END IF;
  IF txt ILIKE '%' || current_setting('test.a') || '%' THEN RAISE EXCEPTION 'FAIL: host user id leaked'; END IF;
  RAISE NOTICE 'PASS: get_shared_plan returns title/time/area/first name/photo and nothing private';

  r := public.get_shared_plan(current_setting('test.tok2'));
  IF r->'plan'->>'neighbourhood' <> 'Schwabing' THEN RAISE EXCEPTION 'FAIL: explicit area should win: %', r; END IF;
  IF r->'plan'->>'fit_line' <> 'Why it fits: you both love strategy games' THEN
    RAISE EXCEPTION 'FAIL: AI fit line missing: %', r;
  END IF;
  RAISE NOTICE 'PASS: AI plans carry their fit line; manual notes never do';

  r := public.get_shared_plan('not-a-real-token-at-all-xx');
  IF r <> '{"status": "not_found"}'::jsonb THEN RAISE EXCEPTION 'FAIL: unknown token → %', r; END IF;
  r := public.get_shared_plan('short');
  IF r <> '{"status": "not_found"}'::jsonb THEN RAISE EXCEPTION 'FAIL: malformed token → %', r; END IF;
  RAISE NOTICE 'PASS: unknown / malformed tokens reveal nothing';
END $$;

DO $$
BEGIN
  PERFORM 1 FROM public.plan_shares LIMIT 1;
  RAISE EXCEPTION 'FAIL: anon can read plan_shares directly';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: anon cannot read plan_shares';
END $$;

DO $$
BEGIN
  PERFORM 1 FROM public.plan_share_rsvps LIMIT 1;
  RAISE EXCEPTION 'FAIL: anon can read plan_share_rsvps directly';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: anon cannot read plan_share_rsvps';
END $$;

DO $$
BEGIN
  PERFORM public.accept_plan_share(current_setting('test.tok1'));
  RAISE EXCEPTION 'FAIL: anon can execute accept_plan_share';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: anon cannot accept / claim / create (signed-in only)';
END $$;

-- Web RSVPs
DO $$
DECLARE r jsonb;
BEGIN
  r := public.web_rsvp(current_setting('test.tok1'), '  Anna  ', 'Anna@Example.com ');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'FAIL: web RSVP → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok1'), 'Anna B', 'anna@example.com');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'FAIL: repeat RSVP → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok1'), 'Anna', 'not-an-email');
  IF r->>'status' <> 'invalid_input' THEN RAISE EXCEPTION 'FAIL: bad email accepted → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok1'), '', 'x@example.com');
  IF r->>'status' <> 'invalid_input' THEN RAISE EXCEPTION 'FAIL: empty name accepted → %', r; END IF;
  RAISE NOTICE 'PASS: web RSVP stores valid answers and rejects bad input';

  -- 5th attempt from this IP in 10 minutes is the last one allowed.
  r := public.web_rsvp(current_setting('test.tok1'), 'Bo', 'bo@example.com');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'FAIL: 5th attempt should pass → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok1'), 'Cy', 'cy@example.com');
  IF r->>'status' <> 'rate_limited' THEN RAISE EXCEPTION 'FAIL: 6th attempt from one IP → %', r; END IF;
  RAISE NOTICE 'PASS: web RSVPs are rate-limited per IP';
END $$;

-- No forwarded IP at all → everyone shares one bucket (fail closed, never unlimited).
SELECT set_config('request.headers', '{}', true);
DO $$
DECLARE r jsonb; i int;
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM public.web_rsvp('not-a-real-token-at-all-xx', 'X', 'x@example.com');
  END LOOP;
  r := public.web_rsvp(current_setting('test.tok3'), 'Dee', 'dee@example.com');
  IF r->>'status' <> 'rate_limited' THEN RAISE EXCEPTION 'FAIL: unknown-IP bucket not limited → %', r; END IF;
  RAISE NOTICE 'PASS: requests without an IP are limited together; bad-token guessing counts too';
END $$;

-- Per-token limit: many IPs hammering one link.
DO $$
DECLARE r jsonb; i int;
BEGIN
  FOR i IN 1..30 LOOP
    PERFORM set_config('request.headers', json_build_object('x-forwarded-for', '203.0.113.' || i)::text, true);
    PERFORM public.web_rsvp(current_setting('test.tok3'), 'P' || i, 'p' || i || '@example.com');
  END LOOP;
  PERFORM set_config('request.headers', '{"x-forwarded-for": "203.0.113.200"}', true);
  r := public.web_rsvp(current_setting('test.tok3'), 'Late', 'late@example.com');
  IF r->>'status' <> 'rate_limited' THEN RAISE EXCEPTION 'FAIL: per-token limit not applied → %', r; END IF;
  RAISE NOTICE 'PASS: web RSVPs are rate-limited per token';
END $$;

-- Ledger pruning: hashed IPs older than a day disappear on the next call (as postgres).
RESET ROLE;
INSERT INTO private.plan_share_rsvp_attempts (ip_hash, created_at) VALUES ('old-hash', now() - INTERVAL '2 days');
SET LOCAL ROLE anon;
SELECT set_config('request.headers', '{"x-forwarded-for": "192.0.2.99"}', true);
SELECT public.web_rsvp('not-a-real-token-at-all-xx', 'X', 'x@example.com');
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM private.plan_share_rsvp_attempts WHERE ip_hash = 'old-hash') THEN
    RAISE EXCEPTION 'FAIL: hashed IPs older than a day are kept';
  END IF;
  IF EXISTS (SELECT 1 FROM private.plan_share_rsvp_attempts WHERE ip_hash ~ '[.:]') THEN
    RAISE EXCEPTION 'FAIL: a raw IP was stored';
  END IF;
  RAISE NOTICE 'PASS: rate-limit ledger stores only hashed IPs and prunes them after a day';
END $$;

-- ── As A: sees who is in — first name, never email ───────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.a'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int; nm text; uses int;
BEGIN
  SELECT count(*), max(first_name) INTO n, nm FROM public.plan_share_rsvps
   WHERE planner_item_id = '00000000-0000-4000-8000-0000000c0001';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: host should see 2 RSVPs (Anna, Bo), saw %', n; END IF;
  SELECT use_count INTO uses FROM public.plan_shares WHERE id = current_setting('test.share1')::uuid;
  IF uses <> 2 THEN RAISE EXCEPTION 'FAIL: a repeat RSVP must not use another seat (use_count %)', uses; END IF;
  RAISE NOTICE 'PASS: host sees web RSVPs; repeat answers update instead of duplicating';
END $$;

DO $$
BEGIN
  PERFORM email FROM public.plan_share_rsvps LIMIT 1;
  RAISE EXCEPTION 'FAIL: host can read invitee emails';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: invitee emails are not readable by the host';
END $$;

-- Revoke
DO $$
DECLARE r jsonb;
BEGIN
  IF NOT public.revoke_plan_share(current_setting('test.share2')::uuid) THEN
    RAISE EXCEPTION 'FAIL: owner could not revoke';
  END IF;
  BEGIN
    UPDATE public.plan_shares SET revoked_at = NULL WHERE id = current_setting('test.share2')::uuid;
    RAISE EXCEPTION 'FAIL: a revoked link was re-enabled';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: a revoked link stays revoked';
  END;
END $$;

-- ── As B: other hosts' RSVPs stay private; joining via the app ───────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plan_share_rsvps;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-host read % RSVPs', n; END IF;
  RAISE NOTICE 'PASS: RSVPs are visible to the host only';
END $$;

-- ── Token states seen by anon: revoked, expired, max uses ────────────────────
RESET ROLE;
-- Expire link 1's sibling: move share3 into the past (as postgres).
UPDATE public.plan_shares
   SET created_at = now() - INTERVAL '8 days', expires_at = now() - INTERVAL '1 day'
 WHERE id = current_setting('test.share3')::uuid;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT set_config('request.headers', '{"x-forwarded-for": "192.0.2.50"}', true);

DO $$
DECLARE r jsonb;
BEGIN
  r := public.get_shared_plan(current_setting('test.tok2'));
  IF r <> '{"status": "revoked"}'::jsonb THEN RAISE EXCEPTION 'FAIL: revoked link → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok2'), 'Eve', 'eve@example.com');
  IF r->>'status' <> 'revoked' THEN RAISE EXCEPTION 'FAIL: RSVP on revoked link → %', r; END IF;
  RAISE NOTICE 'PASS: revoked links show nothing and take no RSVPs';

  r := public.get_shared_plan(current_setting('test.tok3'));
  IF r <> '{"status": "expired"}'::jsonb THEN RAISE EXCEPTION 'FAIL: expired link → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok3'), 'Eve', 'eve@example.com');
  IF r->>'status' NOT IN ('expired', 'rate_limited') THEN RAISE EXCEPTION 'FAIL: RSVP on expired link → %', r; END IF;
  RAISE NOTICE 'PASS: expired links show nothing and take no RSVPs';
END $$;

RESET ROLE;
UPDATE public.plan_shares SET max_uses = 2 WHERE id = current_setting('test.share1')::uuid;
SET LOCAL ROLE anon;
SELECT set_config('request.headers', '{"x-forwarded-for": "192.0.2.51"}', true);

DO $$
DECLARE r jsonb;
BEGIN
  r := public.get_shared_plan(current_setting('test.tok1'));
  IF r->>'status' <> 'full' THEN RAISE EXCEPTION 'FAIL: link at max uses → %', r; END IF;
  r := public.web_rsvp(current_setting('test.tok1'), 'Fay', 'fay@example.com');
  IF r->>'status' <> 'full' THEN RAISE EXCEPTION 'FAIL: RSVP past max uses → %', r; END IF;
  RAISE NOTICE 'PASS: max_uses caps how many people can join';
END $$;

RESET ROLE;
UPDATE public.plan_shares SET max_uses = NULL WHERE id = current_setting('test.share1')::uuid;
SET LOCAL ROLE anon;
SELECT set_config('request.headers', '{"x-forwarded-for": "192.0.2.52"}', true);

-- C (no account yet) and someone typing B's (existing) email both answer on the web.
SELECT public.web_rsvp(current_setting('test.tok1'), 'Cleo', 'Newbie-C@Example.com');
SELECT public.web_rsvp(current_setting('test.tok1'), 'Fake B', 'friend-b@winkly.test');

-- ── Conversion: C signs up with that email ───────────────────────────────────
RESET ROLE;
UPDATE auth.users SET email = 'newbie-c@example.com', email_confirmed_at = NULL, created_at = now()
 WHERE id = current_setting('test.c')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE r jsonb;
BEGIN
  r := public.claim_plan_share_rsvps();
  IF (r->>'converted')::int <> 0 THEN RAISE EXCEPTION 'FAIL: unconfirmed email converted an RSVP: %', r; END IF;
  RAISE NOTICE 'PASS: an unconfirmed email cannot claim RSVPs';
END $$;

RESET ROLE;
UPDATE auth.users SET email_confirmed_at = now() WHERE id = current_setting('test.c')::uuid;
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb; n int; st text;
BEGIN
  r := public.claim_plan_share_rsvps();
  IF (r->>'converted')::int <> 1 OR r->'planner_item_ids'->>0 <> '00000000-0000-4000-8000-0000000c0001' THEN
    RAISE EXCEPTION 'FAIL: signup should convert 1 RSVP: %', r;
  END IF;
  SELECT count(*) INTO n FROM public.planner_participants
   WHERE planner_item_id = '00000000-0000-4000-8000-0000000c0001'
     AND user_id = current_setting('test.c')::uuid AND role = 'attendee';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: converted invitee is not a participant'; END IF;
  SELECT count(*) INTO n FROM public.planner_items WHERE id = '00000000-0000-4000-8000-0000000c0001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: converted invitee cannot see the plan in their planner'; END IF;
  r := public.claim_plan_share_rsvps();
  IF (r->>'converted')::int <> 0 THEN RAISE EXCEPTION 'FAIL: claim is not idempotent: %', r; END IF;
  RAISE NOTICE 'PASS: signing up with the RSVP email turns the invitee into a normal participant';
END $$;

-- ── B already had an account: a web RSVP with their email does NOT auto-join them ──
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.claim_plan_share_rsvps();
  IF (r->>'converted')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: someone typed an existing user''s email and pushed a plan into their planner: %', r;
  END IF;
  SELECT count(*) INTO n FROM public.planner_items WHERE id = '00000000-0000-4000-8000-0000000c0001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: B sees the plan without joining'; END IF;
  RAISE NOTICE 'PASS: existing accounts are never auto-joined by an email typed on the web';

  -- B opens the link in the app → joins explicitly; their pending RSVP converts.
  r := public.accept_plan_share(current_setting('test.tok1'));
  IF r->>'status' <> 'ok' OR (r->>'converted_rsvp')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: opening the link in the app → %', r;
  END IF;
  SELECT count(*) INTO n FROM public.planner_items WHERE id = '00000000-0000-4000-8000-0000000c0001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: plan is not in B''s planner after accepting'; END IF;
  r := public.accept_plan_share(current_setting('test.tok1'));
  IF (r->>'already_joined')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: accept not idempotent → %', r; END IF;
  r := public.accept_plan_share(current_setting('test.tok2'));
  IF r->>'status' <> 'revoked' THEN RAISE EXCEPTION 'FAIL: accepted a revoked link → %', r; END IF;
  r := public.accept_plan_share(current_setting('test.tok3'));
  IF r->>'status' <> 'expired' THEN RAISE EXCEPTION 'FAIL: accepted an expired link → %', r; END IF;
  RAISE NOTICE 'PASS: opening a valid link in the app joins; revoked/expired links do not';
END $$;

-- ── As A: the host sees both conversions ─────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.a'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int; r jsonb;
BEGIN
  SELECT count(*) INTO n FROM public.plan_share_rsvps
   WHERE planner_item_id = '00000000-0000-4000-8000-0000000c0001' AND status = 'converted';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: host should see 2 converted RSVPs, saw %', n; END IF;
  r := public.accept_plan_share(current_setting('test.tok1'));
  IF r->>'status' <> 'own_plan' THEN RAISE EXCEPTION 'FAIL: host opening own link → %', r; END IF;
  RAISE NOTICE 'PASS: host sees converted RSVPs; opening your own link is a no-op';
END $$;

ROLLBACK;
