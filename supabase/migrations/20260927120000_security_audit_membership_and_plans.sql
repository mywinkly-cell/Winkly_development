-- ─────────────────────────────────────────────────────────────────────────────
-- September 2026 security audit — membership, pending plans, chat media.
-- Regression test: supabase/tests/security_audit_2026_09_test.sql
--
-- SEC-7  Self-join. conversation_members, group_members and planner_participants
--        each had a single FOR ALL policy whose only condition was
--        `auth.uid() = user_id`. With no WITH CHECK, Postgres applies that same
--        condition to INSERT — so anyone could add themselves to any chat, group
--        or plan by id, then read its messages and photos. Removing someone only
--        set left_at on their row, which they could clear again to rejoin.
--        group_invitations let anyone invite themselves to any group.
--
-- SEC-8  Plan spam. pending_plans accepted client INSERTs naming any
--        participant_ids; pending-plan-confirm { as_host } then finalized them,
--        writing the plan into every named user's planner, phone and connected
--        Google/Outlook calendar. confirm_pending_plan_host also compared
--        `auth.uid() <> created_by`, which is NULL (so the check is skipped)
--        whenever it runs without a user identity.
--
-- SEC-9  Chat image swap. A sender could overwrite (UPDATE) or delete and
--        re-upload their chat-media object after it passed moderation; the
--        verdict is keyed by path, so recipients saw the new image unblurred.
--
-- Also fixed here:
--   • The conversation_members ↔ conversations policies referenced each other,
--     so on a database built from these migrations any authenticated read of
--     messages/conversations failed with "infinite recursion detected in
--     policy". Membership checks now go through a SECURITY DEFINER helper.
--   • join_event / leave_event were SECURITY INVOKER and relied on the loose
--     self-insert policy for event-chat membership (and could not see an event
--     chat they weren't yet in, so joining an existing chat silently did
--     nothing). They are now private DEFINER functions behind public wrappers,
--     the pattern from 20260710150000.
--
-- DRIFT: production policies on these tables may differ from the migrations.
-- For the four membership/plan tables this migration drops EVERY existing
-- policy (each drop is logged with RAISE NOTICE) and recreates a complete,
-- known set — otherwise a hand-made permissive policy could keep the hole open.
-- Snapshot first:  SELECT tablename, policyname, cmd, qual, with_check
--                  FROM pg_policies WHERE schemaname = 'public'
--                  AND tablename IN ('conversation_members','group_members',
--                                    'planner_participants','pending_plans');
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. Helpers (SECURITY DEFINER so policies can call them without recursing)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
      AND left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_conversation_creator(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND created_by = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_group_creator(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id AND created_by = p_user_id);
$$;

CREATE OR REPLACE FUNCTION private.has_pending_group_invite(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_invitations
    WHERE group_id = p_group_id AND invitee_id = p_user_id AND status = 'pending'
  );
$$;

DO $$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'private.is_conversation_member(uuid, uuid)',
    'private.is_conversation_creator(uuid, uuid)',
    'private.is_group_creator(uuid, uuid)',
    'private.has_pending_group_invite(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END $$;

-- Drops every policy on a table, logging each one (drift visibility).
CREATE OR REPLACE FUNCTION private.drop_all_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    RAISE NOTICE 'security-audit-2026-09: dropping %.% (%)', p_table, r.policyname, r.cmd;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, p_table);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.drop_all_policies(text) FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. conversation_members (SEC-7)
--    Clients never INSERT membership rows — every legitimate path is a DEFINER
--    RPC or trigger (create_direct_chat, create_event_chat, ensure_group_
--    conversation, join_group_by_code, join_event, the mutual-like DM trigger).
--    Clients may only set left_at (leave, or a creator removing someone).
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
SELECT private.drop_all_policies('conversation_members');

CREATE POLICY conversation_members_select ON public.conversation_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_conversation_member(conversation_id, auth.uid())
    OR private.is_conversation_creator(conversation_id, auth.uid())
  );

CREATE POLICY conversation_members_update ON public.conversation_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.is_conversation_creator(conversation_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR private.is_conversation_creator(conversation_id, auth.uid()));

CREATE POLICY conversation_members_delete ON public.conversation_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.is_conversation_creator(conversation_id, auth.uid()));

REVOKE INSERT, UPDATE, TRUNCATE ON public.conversation_members FROM anon, authenticated;
REVOKE ALL ON public.conversation_members FROM anon;
GRANT SELECT, DELETE ON public.conversation_members TO authenticated;
GRANT UPDATE (left_at) ON public.conversation_members TO authenticated;

-- Leaving is one-way for clients: clearing left_at (rejoining) only happens via
-- the DEFINER RPCs above, which run as the function owner, not `authenticated`.
CREATE OR REPLACE FUNCTION public.conversation_members_block_self_rejoin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND OLD.left_at IS NOT NULL AND NEW.left_at IS NULL THEN
    RAISE EXCEPTION 'conversation_members: rejoining requires a new invitation'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_members_block_self_rejoin ON public.conversation_members;
CREATE TRIGGER trg_conversation_members_block_self_rejoin
  BEFORE UPDATE ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.conversation_members_block_self_rejoin();

-- conversations / messages: same rules as before, via the non-recursive helper.
DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT USING (private.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE USING (private.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages
  FOR SELECT USING (private.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND private.is_conversation_member(conversation_id, auth.uid())
    AND public.is_dm_send_allowed(conversation_id, auth.uid())
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. group_members + group_invitations (SEC-7)
--    Client paths kept: the creator adds themselves (createGroupWithInvites) and
--    an invitee with a PENDING invitation adds themselves as 'member'
--    (acceptGroupInvite). Code joins go through join_group_by_code (DEFINER).
--    The creator can no longer force-add people — the product rule is that
--    nobody is auto-added to a group chat.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
SELECT private.drop_all_policies('group_members');

CREATE POLICY group_members_select_own ON public.group_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_group_creator(group_id, auth.uid()));

CREATE POLICY group_members_select_comembers ON public.group_members
  FOR SELECT TO authenticated
  USING (private.is_group_member(group_id, auth.uid()));

CREATE POLICY group_members_insert_self ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      private.is_group_creator(group_id, auth.uid())
      OR (role = 'member' AND private.has_pending_group_invite(group_id, auth.uid()))
    )
  );

CREATE POLICY group_members_delete ON public.group_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.is_group_creator(group_id, auth.uid()));

REVOKE UPDATE, TRUNCATE ON public.group_members FROM anon, authenticated;

DROP POLICY IF EXISTS group_invitations_inviter_insert ON public.group_invitations;
CREATE POLICY group_invitations_inviter_insert ON public.group_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND invitee_id <> auth.uid()
    AND (private.is_group_creator(group_id, auth.uid()) OR private.is_group_member(group_id, auth.uid()))
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. planner_participants (SEC-7)
--    Kept: the creator adds themselves (any role) and seeds other people only
--    as a pending 'invitee' (createPlannerInvite — seeded before the invitation
--    row exists, including in app versions already installed); an invitee adds
--    or upgrades their own row once invited (acceptPlannerInvite upsert).
--    Finalized group plans are written by pending-plan-confirm (service role).
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.planner_participants ENABLE ROW LEVEL SECURITY;
SELECT private.drop_all_policies('planner_participants');

CREATE POLICY planner_participants_select ON public.planner_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_planner_item_creator(planner_item_id, auth.uid()));

CREATE POLICY planner_participants_insert ON public.planner_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND (
        public.is_planner_item_creator(planner_item_id, auth.uid())
        OR public.is_planner_invitee(planner_item_id, auth.uid())
      )
    )
    OR (
      user_id <> auth.uid()
      AND role = 'invitee'
      AND public.is_planner_item_creator(planner_item_id, auth.uid())
    )
  );

CREATE POLICY planner_participants_update ON public.planner_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_planner_item_creator(planner_item_id, auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    OR (role = 'invitee' AND public.is_planner_item_creator(planner_item_id, auth.uid()))
  );

CREATE POLICY planner_participants_delete ON public.planner_participants
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_planner_item_creator(planner_item_id, auth.uid()));

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. pending_plans (SEC-8)
--    Plans are generated server-side (ai-gateway, weather-pivot-cron — service
--    role, which validates co-planners). The app only ever cancels its own
--    plan (dismissWeatherPivot), so clients get no INSERT and may only move
--    status to 'cancelled'.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pending_plans ENABLE ROW LEVEL SECURITY;
SELECT private.drop_all_policies('pending_plans');

CREATE POLICY pending_plans_select ON public.pending_plans
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = ANY (participant_ids));

CREATE POLICY pending_plans_cancel ON public.pending_plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND status IN ('pending', 'pivot_pending'))
  WITH CHECK (auth.uid() = created_by AND status = 'cancelled');

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pending_plans FROM anon, authenticated;
GRANT SELECT ON public.pending_plans TO authenticated;
GRANT UPDATE (status, updated_at) ON public.pending_plans TO authenticated;

-- Confirm RPCs refuse to act without a user identity. `#variable_conflict
-- use_column` fixes a latent bug: ON CONFLICT (pending_plan_id, ...) was
-- ambiguous with the OUT column of the same name, so both RPCs always errored. (pending-plan-confirm
-- now calls them with the caller's JWT so auth.uid() is the real user.)
CREATE OR REPLACE FUNCTION public.confirm_pending_plan(p_plan_id uuid)
RETURNS TABLE (pending_plan_id uuid, confirmed_count int, participant_count int, all_participants_confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  pid UUID := p_plan_id;
  p_row public.pending_plans%ROWTYPE;
  cc INT;
  pc INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO p_row FROM public.pending_plans WHERE id = pid;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT (auth.uid() = ANY (p_row.participant_ids)) THEN
    RETURN;
  END IF;
  IF p_row.status NOT IN ('pending', 'pivot_pending') THEN
    RETURN;
  END IF;

  INSERT INTO public.pending_plan_confirmations (pending_plan_id, user_id)
  VALUES (pid, auth.uid())
  ON CONFLICT (pending_plan_id, user_id) DO NOTHING;

  SELECT COUNT(*)::int INTO cc FROM public.pending_plan_confirmations c WHERE c.pending_plan_id = pid;
  SELECT COALESCE(array_length(p_row.participant_ids, 1), 0)::int INTO pc;

  pending_plan_id := pid;
  confirmed_count := cc;
  participant_count := pc;
  all_participants_confirmed := (pc > 0 AND cc >= pc);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_pending_plan_host(p_plan_id uuid)
RETURNS TABLE (pending_plan_id uuid, confirmed_count int, participant_count int, all_participants_confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  pid UUID := p_plan_id;
  p_row public.pending_plans%ROWTYPE;
  uid UUID;
  cc INT;
  pc INT;
BEGIN
  SELECT * INTO p_row FROM public.pending_plans WHERE id = pid;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Host only. IS DISTINCT FROM: a NULL auth.uid() must fail the check, not skip it.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_row.created_by THEN
    RETURN;
  END IF;
  IF p_row.status NOT IN ('pending', 'pivot_pending') THEN
    RETURN;
  END IF;

  FOREACH uid IN ARRAY p_row.participant_ids LOOP
    INSERT INTO public.pending_plan_confirmations (pending_plan_id, user_id)
    VALUES (pid, uid)
    ON CONFLICT (pending_plan_id, user_id) DO NOTHING;
  END LOOP;

  SELECT COUNT(*)::int INTO cc FROM public.pending_plan_confirmations c WHERE c.pending_plan_id = pid;
  SELECT COALESCE(array_length(p_row.participant_ids, 1), 0)::int INTO pc;

  pending_plan_id := pid;
  confirmed_count := cc;
  participant_count := pc;
  all_participants_confirmed := (pc > 0 AND cc >= pc);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pending_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_pending_plan_host(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_pending_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_pending_plan_host(uuid) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. chat-media (SEC-9): sent media is immutable for clients. Uploads use
--    unique paths; account deletion removes objects with the service role.
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS chat_media_owner_update ON storage.objects;
DROP POLICY IF EXISTS chat_media_owner_delete ON storage.objects;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. join_event / leave_event → private DEFINER + public INVOKER wrapper
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.join_event(p_event_id uuid, p_status text DEFAULT 'going')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conv_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'join_event: not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_status NOT IN ('going', 'interested', 'not_going') THEN
    RAISE EXCEPTION 'join_event: invalid status %', p_status USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'join_event: event not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.event_participants (event_id, user_id, rsvp_status)
  VALUES (p_event_id, v_uid, p_status)
  ON CONFLICT (event_id, user_id) DO UPDATE SET rsvp_status = EXCLUDED.rsvp_status;

  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  WHERE c.related_event_id = p_event_id AND c.type = 'event'
  ORDER BY c.created_at
  LIMIT 1;

  IF v_conv_id IS NOT NULL AND p_status IN ('going', 'interested') THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conv_id, v_uid, 'member')
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL;
  ELSIF v_conv_id IS NOT NULL AND p_status = 'not_going' THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id = v_conv_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'event_id', p_event_id, 'status', p_status, 'conversation_id', v_conv_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.leave_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conv_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'leave_event: not authenticated' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.event_participants WHERE event_id = p_event_id AND user_id = v_uid;

  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  WHERE c.related_event_id = p_event_id AND c.type = 'event'
  ORDER BY c.created_at
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id = v_conv_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'event_id', p_event_id, 'conversation_id', v_conv_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_event(p_event_id uuid, p_status text DEFAULT 'going')
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.join_event(p_event_id, p_status) $$;

CREATE OR REPLACE FUNCTION public.leave_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.leave_event(p_event_id) $$;

DO $$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'private.join_event(uuid, text)', 'private.leave_event(uuid)',
    'public.join_event(uuid, text)', 'public.leave_event(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END $$;
