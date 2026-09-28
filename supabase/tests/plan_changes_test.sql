-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test: plan changes and plan alerts (20260928130000_plan_changes_and_alerts.sql).
--
-- A organises a plan with B; C is a stranger. Checks who can read the change history,
-- that alerts are private to their owner and can only be dismissed (not rewritten), and
-- that participant coordinates stay server-only.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_changes_test.sql
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

-- Fixtures (as postgres, i.e. what the plan-update / plan-watch-cron functions write).
INSERT INTO public.planner_items (id, created_by, source_mode, title, starts_at)
VALUES ('00000000-0000-4000-8000-00000000c001', current_setting('test.a')::uuid, 'romance', 'Dinner', now() + interval '1 day');
INSERT INTO public.planner_participants (planner_item_id, user_id, role)
VALUES ('00000000-0000-4000-8000-00000000c001', current_setting('test.a')::uuid, 'owner'),
       ('00000000-0000-4000-8000-00000000c001', current_setting('test.b')::uuid, 'attendee');
INSERT INTO public.plan_changes (planner_item_id, actor_id, kind, reason, old_starts_at, new_starts_at)
VALUES ('00000000-0000-4000-8000-00000000c001', current_setting('test.a')::uuid, 'rescheduled', 'Running late',
        now() + interval '1 day', now() + interval '1 day 1 hour');
INSERT INTO public.plan_alerts (id, user_id, planner_item_id, kind, condition, severity)
VALUES ('00000000-0000-4000-8000-00000000d001', current_setting('test.b')::uuid,
        '00000000-0000-4000-8000-00000000c001', 'weather', 'storm', 85);

-- The same condition is announced only once.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.plan_alerts (user_id, planner_item_id, kind, condition, severity)
    VALUES (current_setting('test.b')::uuid, '00000000-0000-4000-8000-00000000c001', 'weather', 'storm', 90);
    RAISE EXCEPTION 'FAIL: a duplicate alert for the same condition was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: each alert condition is stored once per user and plan';
  END;
END $$;

SET LOCAL ROLE authenticated;

-- ── As B (participant) ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plan_changes WHERE planner_item_id = '00000000-0000-4000-8000-00000000c001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: participant should see the change history, saw %', n; END IF;
  RAISE NOTICE 'PASS: participants read why the plan changed';

  SELECT count(*) INTO n FROM public.plan_alerts;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: B should see their own alert, saw %', n; END IF;

  UPDATE public.plan_alerts SET dismissed_at = now() WHERE id = '00000000-0000-4000-8000-00000000d001';
  SELECT count(*) INTO n FROM public.plan_alerts WHERE dismissed_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: B could not dismiss their alert'; END IF;
  RAISE NOTICE 'PASS: the owner reads and dismisses their alert';

  BEGIN
    UPDATE public.plan_alerts SET severity = 0 WHERE id = '00000000-0000-4000-8000-00000000d001';
    RAISE EXCEPTION 'FAIL: B rewrote an alert''s severity';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: alerts can only be dismissed, not rewritten';
  END;

  BEGIN
    INSERT INTO public.plan_changes (planner_item_id, actor_id, kind)
    VALUES ('00000000-0000-4000-8000-00000000c001', current_setting('test.b')::uuid, 'cancelled');
    RAISE EXCEPTION 'FAIL: a client wrote plan_changes directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: change history is written only by the server';
  END;

  BEGIN
    PERFORM * FROM public.plan_watch_user_coords(ARRAY[current_setting('test.a')::uuid]);
    RAISE EXCEPTION 'FAIL: a client read other users'' coordinates';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: participant coordinates stay server-only';
  END;

  -- Dropping out is a write to your own participant row.
  UPDATE public.planner_participants SET cancelled_at = now(), cancel_reason = 'Sick'
  WHERE planner_item_id = '00000000-0000-4000-8000-00000000c001' AND user_id = current_setting('test.b')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: B could not mark their own participation cancelled'; END IF;
  RAISE NOTICE 'PASS: a participant can drop out of a plan';
END $$;

-- ── As C (stranger) ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plan_changes;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a stranger read % plan changes', n; END IF;
  SELECT count(*) INTO n FROM public.plan_alerts;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a stranger read % plan alerts', n; END IF;
  UPDATE public.plan_alerts SET dismissed_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a stranger dismissed % alerts', n; END IF;
  RAISE NOTICE 'PASS: strangers see and touch nothing';
END $$;

ROLLBACK;
