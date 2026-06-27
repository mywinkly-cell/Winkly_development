-- ─────────────────────────────────────────────────────────────────────────────
-- Two-user RLS test: a proposed date (planner_item + planner_invitation) must be
-- readable by BOTH the proposer and the recipient, and by nobody else.
--
-- Reproduces the "one-sided planner visibility" bug and proves the fix in
-- 20260702120000_planner_invitee_visibility_and_match_chat.sql.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/planner_invitee_visibility_test.sql
--   (or paste into the Supabase SQL editor).
--
-- Requires at least two existing auth.users; a third enables the negative case.
-- Runs entirely inside a transaction and ROLLBACKs — no rows are left behind.
-- A failing assertion RAISEs EXCEPTION (so ON_ERROR_STOP turns it into a non-zero
-- exit); success prints NOTICE "PASS:" lines.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Pick test users (as the bootstrapping role) and stash ids in session GUCs that
-- survive the role switches below.
SELECT set_config('test.user_a', (SELECT id::text FROM auth.users ORDER BY created_at, id LIMIT 1), false);
SELECT set_config('test.user_b',
  (SELECT id::text FROM auth.users
     WHERE id <> current_setting('test.user_a')::uuid
     ORDER BY created_at, id LIMIT 1), false);
SELECT set_config('test.user_c',
  COALESCE((SELECT id::text FROM auth.users
     WHERE id NOT IN (current_setting('test.user_a')::uuid, current_setting('test.user_b')::uuid)
     ORDER BY created_at, id LIMIT 1), ''), false);
SELECT set_config('test.item_id', gen_random_uuid()::text, false);
SELECT set_config('test.inv_id', gen_random_uuid()::text, false);

DO $$
BEGIN
  IF COALESCE(current_setting('test.user_a', true), '') = ''
     OR COALESCE(current_setting('test.user_b', true), '') = '' THEN
    RAISE EXCEPTION 'This test needs at least two rows in auth.users';
  END IF;
END $$;

-- ── Act as the PROPOSER (user A) ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, true);

-- Mirror createPlannerInvite(): item + participant rows for BOTH sides + invitation.
INSERT INTO public.planner_items (id, created_by, source_mode, related_user_id, title, starts_at)
VALUES (
  current_setting('test.item_id')::uuid,
  current_setting('test.user_a')::uuid,
  'romance',
  current_setting('test.user_b')::uuid,
  'RLS visibility test date',
  now() + interval '2 days'
);

INSERT INTO public.planner_participants (planner_item_id, user_id, role) VALUES
  (current_setting('test.item_id')::uuid, current_setting('test.user_a')::uuid, 'owner'),
  (current_setting('test.item_id')::uuid, current_setting('test.user_b')::uuid, 'invitee');

INSERT INTO public.planner_invitations (id, planner_item_id, inviter_id, invitee_id, status)
VALUES (
  current_setting('test.inv_id')::uuid,
  current_setting('test.item_id')::uuid,
  current_setting('test.user_a')::uuid,
  current_setting('test.user_b')::uuid,
  'pending'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.planner_items WHERE id = current_setting('test.item_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'FAIL: proposer cannot read their own planner_item';
  END IF;
  RAISE NOTICE 'PASS: proposer can read the proposed date';
END $$;

-- ── Switch to the RECIPIENT (user B) — the bug was here ──────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_b'), 'role', 'authenticated')::text, true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.planner_items WHERE id = current_setting('test.item_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'FAIL: recipient cannot read the proposed planner_item (one-sided visibility bug)';
  END IF;
  IF (SELECT count(*) FROM public.planner_invitations WHERE id = current_setting('test.inv_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'FAIL: recipient cannot read the planner_invitation';
  END IF;
  RAISE NOTICE 'PASS: recipient can read BOTH the proposed planner_item and the invitation';
END $$;

-- ── Negative: an unrelated user (C) must see nothing ─────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', COALESCE(NULLIF(current_setting('test.user_c', true), ''), current_setting('test.user_a')),
    'role', 'authenticated'
  )::text, true);

DO $$
DECLARE v_c text := current_setting('test.user_c', true);
BEGIN
  IF v_c IS NULL OR v_c = '' THEN
    RAISE NOTICE 'SKIP: no third user available for the negative case';
  ELSIF (SELECT count(*) FROM public.planner_items WHERE id = current_setting('test.item_id')::uuid) <> 0 THEN
    RAISE EXCEPTION 'FAIL: unrelated user can read the planner_item (RLS leak)';
  ELSE
    RAISE NOTICE 'PASS: unrelated user is correctly blocked';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
