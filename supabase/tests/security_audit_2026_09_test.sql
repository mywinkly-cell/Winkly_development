-- ─────────────────────────────────────────────────────────────────────────────
-- Regression test for the September 2026 security audit.
--
-- Every "attack" block below was a working exploit against the schema before
-- 20260927120000_security_audit_membership_and_plans.sql. Each was reproduced
-- against a local stack (all migrations applied) before the fix, and every
-- "still works" block guards a legitimate app flow the fix must not break.
--
--   SEC-7  anyone could add themselves to any conversation / group / planner item
--          (FOR ALL policies whose only check was `user_id = auth.uid()`), and a
--          removed member could clear their own left_at to rejoin
--   SEC-8  anyone could create a pending plan naming arbitrary participants and
--          host-confirm it — pushing events into strangers' planners, phones and
--          Google/Outlook calendars; the host check was also skipped when the
--          RPC ran without a user identity (auth.uid() IS NULL)
--   SEC-9  a chat image could be overwritten after it passed moderation (the
--          verdict is keyed by path), so recipients saw it unblurred
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_audit_2026_09_test.sql
--
-- Creates its own throwaway users and rows inside a transaction and ROLLBACKs —
-- nothing is left behind. A failing assertion RAISEs EXCEPTION; successes print
-- NOTICE 'PASS:' lines.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Fixture (as the bootstrapping role)
--   A, B   matched pair sharing a DM; A owns a group and a planner item
--   C      an unrelated attacker
--   D      a user A has invited to the group
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('t.a', gen_random_uuid()::text, false);
SELECT set_config('t.b', gen_random_uuid()::text, false);
SELECT set_config('t.c', gen_random_uuid()::text, false);
SELECT set_config('t.d', gen_random_uuid()::text, false);

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
SELECT u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'sec-audit-' || u || '@winkly-test.local', '{}'::jsonb, now(), now()
FROM unnest(ARRAY[current_setting('t.a'), current_setting('t.b'),
                  current_setting('t.c'), current_setting('t.d')]) AS u;

-- A ↔ B direct conversation with one private message.
SELECT set_config('t.dm', gen_random_uuid()::text, false);
INSERT INTO public.conversations (id, type, mode, created_by)
VALUES (current_setting('t.dm')::uuid, 'dm', 'friends', current_setting('t.a')::uuid);
INSERT INTO public.conversation_members (conversation_id, user_id)
VALUES (current_setting('t.dm')::uuid, current_setting('t.a')::uuid),
       (current_setting('t.dm')::uuid, current_setting('t.b')::uuid);
INSERT INTO public.messages (conversation_id, sender_id, content)
VALUES (current_setting('t.dm')::uuid, current_setting('t.a')::uuid, 'private: meet me at 8');

-- A's group with a pending invitation for D.
SELECT set_config('t.grp', gen_random_uuid()::text, false);
INSERT INTO public.groups (id, created_by, name, mode)
VALUES (current_setting('t.grp')::uuid, current_setting('t.a')::uuid, 'Sec audit group', 'friends');
INSERT INTO public.group_members (group_id, user_id, role)
VALUES (current_setting('t.grp')::uuid, current_setting('t.a')::uuid, 'admin');
INSERT INTO public.group_invitations (group_id, inviter_id, invitee_id, status)
VALUES (current_setting('t.grp')::uuid, current_setting('t.a')::uuid, current_setting('t.d')::uuid, 'pending');

-- A's planner item.
SELECT set_config('t.item', gen_random_uuid()::text, false);
INSERT INTO public.planner_items (id, created_by, source_mode, title, starts_at)
VALUES (current_setting('t.item')::uuid, current_setting('t.a')::uuid, 'friends',
        'Private dinner', now() + interval '2 days');

-- A pending plan A ↔ B, as the AI gateway (service role) creates them.
SELECT set_config('t.plan', gen_random_uuid()::text, false);
INSERT INTO public.pending_plans (id, created_by, source_mode, participant_ids, plan_json, conversation_id)
VALUES (current_setting('t.plan')::uuid, current_setting('t.a')::uuid, 'friends',
        ARRAY[current_setting('t.a')::uuid, current_setting('t.b')::uuid],
        jsonb_build_object('date_time', (now() + interval '3 days')::text), current_setting('t.dm')::uuid);

-- A chat image B uploaded to the A ↔ B conversation.
SELECT set_config('t.obj', current_setting('t.b') || '/' || current_setting('t.dm') || '/photo.jpg', false);
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('chat-media', current_setting('t.obj'), current_setting('t.b')::uuid, '{"mimetype":"image/jpeg"}');

-- A public event whose chat already exists (created by the host).
SELECT set_config('t.event', gen_random_uuid()::text, false);
INSERT INTO public.events (id, created_by, title, mode, visibility, starts_at)
VALUES (current_setting('t.event')::uuid, current_setting('t.a')::uuid, 'Sec audit meetup',
        'events', 'public', now() + interval '5 days');
SELECT set_config('t.eventchat', gen_random_uuid()::text, false);
INSERT INTO public.conversations (id, type, mode, created_by, related_event_id)
VALUES (current_setting('t.eventchat')::uuid, 'event', 'events', current_setting('t.a')::uuid,
        current_setting('t.event')::uuid);
INSERT INTO public.conversation_members (conversation_id, user_id, role)
VALUES (current_setting('t.eventchat')::uuid, current_setting('t.a')::uuid, 'owner');

SET LOCAL ROLE authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-7 · conversation membership
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_blocked boolean; v_seen int;
BEGIN
  BEGIN
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (current_setting('t.dm')::uuid, current_setting('t.c')::uuid);
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  SELECT count(*) INTO v_seen FROM public.messages WHERE conversation_id = current_setting('t.dm')::uuid;
  IF NOT v_blocked OR v_seen > 0 THEN
    RAISE EXCEPTION 'FAIL (SEC-7): an outsider added themselves to a private conversation (read % messages)', v_seen;
  END IF;
  RAISE NOTICE 'PASS: an outsider cannot join someone else''s conversation';
END $$;

-- B leaves the DM (legitimate), then tries to come back on their own.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.conversation_members SET left_at = now()
   WHERE conversation_id = current_setting('t.dm')::uuid AND user_id = current_setting('t.b')::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL (SEC-7 regression): a member can no longer leave a conversation';
  END IF;
  RAISE NOTICE 'PASS: a member can still leave a conversation';
END $$;

DO $$
DECLARE v_blocked boolean; v_rows int := 0;
BEGIN
  BEGIN
    UPDATE public.conversation_members SET left_at = NULL
     WHERE conversation_id = current_setting('t.dm')::uuid AND user_id = current_setting('t.b')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): a member who left (or was removed) rejoined by clearing left_at';
  END IF;
  RAISE NOTICE 'PASS: a removed/left member cannot rejoin by clearing left_at';
END $$;

DO $$
DECLARE v_blocked boolean; v_rows int := 0;
BEGIN
  BEGIN
    UPDATE public.conversation_members SET role = 'admin'
     WHERE conversation_id = current_setting('t.dm')::uuid AND user_id = current_setting('t.b')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): a member promoted themselves to admin';
  END IF;
  RAISE NOTICE 'PASS: a member cannot change their own role';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-7 · groups
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (current_setting('t.grp')::uuid, current_setting('t.c')::uuid, 'admin');
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): an outsider joined a group (as admin) without an invitation';
  END IF;
  RAISE NOTICE 'PASS: an outsider cannot join a group without an invitation';
END $$;

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    INSERT INTO public.group_invitations (group_id, inviter_id, invitee_id, status)
    VALUES (current_setting('t.grp')::uuid, current_setting('t.c')::uuid, current_setting('t.c')::uuid, 'pending');
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): an outsider issued themselves an invitation to someone else''s group';
  END IF;
  RAISE NOTICE 'PASS: only group members can send group invitations';
END $$;

-- D accepts A's invitation — the real acceptGroupInvite flow (lib/groupInvitations.ts).
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.d'), 'role', 'authenticated')::text, true);

DO $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (current_setting('t.grp')::uuid, current_setting('t.d')::uuid, 'member');
  RAISE NOTICE 'PASS: an invited user can still accept and join the group';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SEC-7 regression): an invited user could not join: %', SQLERRM;
END $$;

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (current_setting('t.grp')::uuid, current_setting('t.d')::uuid, 'admin')
    ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
    v_blocked := NOT EXISTS (SELECT 1 FROM public.group_members
                              WHERE group_id = current_setting('t.grp')::uuid
                                AND user_id = current_setting('t.d')::uuid AND role = 'admin');
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): an invited member promoted themselves to admin';
  END IF;
  RAISE NOTICE 'PASS: an invited member cannot make themselves admin';
END $$;

-- A creates a new group and adds themselves as admin — the real createGroupWithInvites flow.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.a'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_gid uuid;
BEGIN
  INSERT INTO public.groups (created_by, name, mode)
  VALUES (current_setting('t.a')::uuid, 'Second group', 'friends') RETURNING id INTO v_gid;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_gid, current_setting('t.a')::uuid, 'admin');
  PERFORM set_config('t.grp2', v_gid::text, false);
  RAISE NOTICE 'PASS: a group creator can still add themselves as admin';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SEC-7 regression): group creation flow broke: %', SQLERRM;
END $$;

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (current_setting('t.grp2')::uuid, current_setting('t.c')::uuid, 'member');
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): a group creator force-added a stranger without an invitation';
  END IF;
  RAISE NOTICE 'PASS: a group creator cannot force-add people (invitations only)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-7 · planner items
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_blocked boolean; v_seen int;
BEGIN
  BEGIN
    INSERT INTO public.planner_participants (planner_item_id, user_id, role)
    VALUES (current_setting('t.item')::uuid, current_setting('t.c')::uuid, 'attendee');
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  SELECT count(*) INTO v_seen FROM public.planner_items WHERE id = current_setting('t.item')::uuid;
  IF NOT v_blocked OR v_seen > 0 THEN
    RAISE EXCEPTION 'FAIL (SEC-7): an outsider joined someone else''s planner item';
  END IF;
  RAISE NOTICE 'PASS: an outsider cannot join someone else''s planner item';
END $$;

-- A seeds B's "invitee" row — the real createPlannerInvite flow.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.a'), 'role', 'authenticated')::text, true);

DO $$
BEGIN
  INSERT INTO public.planner_participants (planner_item_id, user_id, role)
  VALUES (current_setting('t.item')::uuid, current_setting('t.a')::uuid, 'owner'),
         (current_setting('t.item')::uuid, current_setting('t.b')::uuid, 'invitee');
  INSERT INTO public.planner_invitations (planner_item_id, inviter_id, invitee_id, status)
  VALUES (current_setting('t.item')::uuid, current_setting('t.a')::uuid, current_setting('t.b')::uuid, 'pending');
  RAISE NOTICE 'PASS: a planner creator can still invite someone';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SEC-7 regression): planner invite flow broke: %', SQLERRM;
END $$;

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    INSERT INTO public.planner_participants (planner_item_id, user_id, role)
    VALUES (current_setting('t.item')::uuid, current_setting('t.c')::uuid, 'attendee');
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-7): a planner creator put a stranger straight onto their plan as an attendee';
  END IF;
  RAISE NOTICE 'PASS: a planner creator can only add others as a pending invitee';
END $$;

-- B accepts — the real acceptPlannerInvite upsert.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.b'), 'role', 'authenticated')::text, true);

DO $$
BEGIN
  INSERT INTO public.planner_participants (planner_item_id, user_id, role)
  VALUES (current_setting('t.item')::uuid, current_setting('t.b')::uuid, 'attendee')
  ON CONFLICT (planner_item_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  RAISE NOTICE 'PASS: an invitee can still accept a planner invitation';
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'FAIL (SEC-7 regression): planner accept flow broke: %', SQLERRM;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-8 · pending plans
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_blocked boolean;
BEGIN
  BEGIN
    INSERT INTO public.pending_plans (created_by, source_mode, participant_ids, plan_json)
    VALUES (current_setting('t.c')::uuid, 'friends',
            ARRAY[current_setting('t.c')::uuid, current_setting('t.a')::uuid, current_setting('t.b')::uuid],
            '{"options":[{"title":"Your account is locked - verify at evil.example"}]}'::jsonb);
    v_blocked := false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-8): a client created a pending plan naming arbitrary participants';
  END IF;
  RAISE NOTICE 'PASS: clients cannot create pending plans for other people';
END $$;

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.a'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_blocked boolean; v_rows int := 0;
BEGIN
  BEGIN
    UPDATE public.pending_plans
       SET participant_ids = participant_ids || current_setting('t.c')::uuid
     WHERE id = current_setting('t.plan')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-8): a plan creator rewrote participant_ids after generation';
  END IF;
  RAISE NOTICE 'PASS: a plan creator cannot add participants after the fact';
END $$;

-- B confirms with their own identity — the non-host confirm path.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_n int;
BEGIN
  PERFORM * FROM public.confirm_pending_plan(current_setting('t.plan')::uuid);
  SELECT count(*) INTO v_n FROM public.pending_plan_confirmations
   WHERE pending_plan_id = current_setting('t.plan')::uuid AND user_id = current_setting('t.b')::uuid;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (SEC-8 regression): a participant could not confirm a plan';
  END IF;
  RAISE NOTICE 'PASS: a participant can still confirm a plan';
END $$;

-- The host RPC run with no user identity (how pending-plan-confirm used to call it).
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

DO $$
DECLARE v_n int;
BEGIN
  PERFORM * FROM public.confirm_pending_plan_host(current_setting('t.plan')::uuid);
  SELECT count(*) INTO v_n FROM public.pending_plan_confirmations
   WHERE pending_plan_id = current_setting('t.plan')::uuid AND user_id = current_setting('t.a')::uuid;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'FAIL (SEC-8): confirm_pending_plan_host confirmed for everyone without a user identity';
  END IF;
  RAISE NOTICE 'PASS: confirm_pending_plan_host refuses to run without a user identity';
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-9 · chat media cannot change after moderation
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.b'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_blocked boolean; v_rows int := 0;
BEGIN
  BEGIN
    UPDATE storage.objects SET metadata = '{"mimetype":"image/jpeg","swapped":true}'
     WHERE bucket_id = 'chat-media' AND name = current_setting('t.obj');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-9): a sender could overwrite a chat image after moderation';
  END IF;
  RAISE NOTICE 'PASS: a sent chat image cannot be overwritten';
END $$;

DO $$
DECLARE v_blocked boolean; v_rows int := 0;
BEGIN
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name = current_setting('t.obj');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FAIL (SEC-9): a sender could delete (and so re-upload) a moderated chat image';
  END IF;
  RAISE NOTICE 'PASS: a sent chat image cannot be deleted and re-uploaded';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- join_event still adds the user to an existing event chat (it used to rely on
-- the loose membership policy — and silently didn't, because an outsider can't
-- see the chat to look it up)
-- ══════════════════════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('t.c'), 'role', 'authenticated')::text, true);

DO $$
DECLARE v_joined boolean;
BEGIN
  PERFORM public.join_event(current_setting('t.event')::uuid, 'going');
  SELECT EXISTS (SELECT 1 FROM public.conversation_members
                  WHERE conversation_id = current_setting('t.eventchat')::uuid
                    AND user_id = current_setting('t.c')::uuid AND left_at IS NULL) INTO v_joined;
  IF NOT v_joined THEN
    RAISE EXCEPTION 'FAIL (regression): join_event did not add the user to the event chat';
  END IF;
  PERFORM public.leave_event(current_setting('t.event')::uuid);
  SELECT EXISTS (SELECT 1 FROM public.conversation_members
                  WHERE conversation_id = current_setting('t.eventchat')::uuid
                    AND user_id = current_setting('t.c')::uuid AND left_at IS NULL) INTO v_joined;
  IF v_joined THEN
    RAISE EXCEPTION 'FAIL (regression): leave_event did not remove the user from the event chat';
  END IF;
  RAISE NOTICE 'PASS: join_event / leave_event manage event chat membership';
END $$;

ROLLBACK;
