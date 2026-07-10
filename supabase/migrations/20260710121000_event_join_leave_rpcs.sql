-- Event RSVP RPCs used by apps/mobile/app/(modes)/events/event-details.tsx.
-- Idempotent on dev (replaces manual/dashboard definitions) and adds to prod.

-- Internal helper — not a client /rpc (revoked from authenticated by 20260710120000).
CREATE OR REPLACE FUNCTION public.get_event_conversation_id(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.conversations c
  WHERE c.related_event_id = p_event_id
    AND c.type = 'event'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_event_conversation_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_conversation_id(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.join_event(
  p_event_id uuid,
  p_status text DEFAULT 'going'
)
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

  INSERT INTO public.event_participants (event_id, user_id, rsvp_status)
  VALUES (p_event_id, v_uid, p_status)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET rsvp_status = EXCLUDED.rsvp_status;

  v_conv_id := public.get_event_conversation_id(p_event_id);

  IF v_conv_id IS NOT NULL AND p_status IN ('going', 'interested') THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conv_id, v_uid, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  ELSIF v_conv_id IS NOT NULL AND p_status = 'not_going' THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id = v_conv_id
      AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'status', p_status,
    'conversation_id', v_conv_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_event(p_event_id uuid)
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

  DELETE FROM public.event_participants
  WHERE event_id = p_event_id
    AND user_id = v_uid;

  v_conv_id := public.get_event_conversation_id(p_event_id);

  IF v_conv_id IS NOT NULL THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id = v_conv_id
      AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'conversation_id', v_conv_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_event(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_event(uuid) TO authenticated;

-- Re-run allowlist sweep (idempotent) so cloud DBs that received a partial
-- 20260710120000 via MCP pick up any newly added client RPCs and drop drift.
DO $$
DECLARE
  r record;
  v_allowlisted text[] := ARRAY[
    'accept_romance_chat_invite',
    'decline_romance_chat_invite',
    'romance_connections',
    'romance_discover_feed',
    'romance_discover_feed_geo',
    'romance_like_profile',
    'romance_liked_profiles',
    'romance_likes_received',
    'romance_new_matches',
    'romance_pending_chat_invites',
    'friends_accept_request',
    'friends_decline_request',
    'friends_discover_feed',
    'friends_follow_profile',
    'business_accept_connection',
    'business_connect',
    'business_decline_connection',
    'business_discover_feed',
    'business_home_feed',
    'business_pending_invites_count',
    'business_profile_for_viewer',
    'create_event_chat',
    'join_event',
    'leave_event',
    'create_direct_chat',
    'conversation_eligible_for_concierge_nudge',
    'dismiss_concierge_nudge',
    'ensure_group_conversation',
    'ensure_group_invite_code',
    'get_conversation_unread_counts',
    'join_group_by_code',
    'mark_messages_delivered',
    'match_contacts',
    'get_my_location_precision',
    'set_my_location',
    'set_my_location_precision',
    'record_business_analytics_event',
    'record_pair_behavior_signal',
    'remove_mode_connection',
    'set_cached_ai_plan',
    'is_dm_send_allowed',
    'is_group_member'
  ];
BEGIN
  DROP FUNCTION IF EXISTS public.create_derect_chat(uuid, uuid, app_mode, dm_source, uuid);
  DROP FUNCTION IF EXISTS public.create_direct_chat(text, uuid, text);
  DROP FUNCTION IF EXISTS public.create_event_chat(uuid, text);

  FOR r IN
    SELECT p.oid::regprocedure AS signature, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT (p.proname = ANY (v_allowlisted))
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      r.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      r.signature
    );
  END LOOP;
END $$;
