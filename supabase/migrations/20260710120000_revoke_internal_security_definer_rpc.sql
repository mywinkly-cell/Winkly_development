-- Security Advisor lint 0029 — full lockdown of internal SECURITY DEFINER RPCs.
--
-- Strategy: allowlist the intentional signed-in client /rpc entrypoints (and RLS
-- policy helpers). Every other public SECURITY DEFINER function loses EXECUTE
-- from PUBLIC, anon, and authenticated. service_role retains access for edge
-- functions, cron, and trigger-internal calls.
--
-- Remaining ~41–44 advisor warnings are expected until those client RPCs move to
-- SECURITY INVOKER or a private schema.
--
-- Migration history note (prod): if MCP applied duplicate versions
-- (20260710104620 / 20260710104914), repair before db push:
--   supabase migration repair --status reverted 20260710104620 20260710104914
--   supabase migration repair --status applied 20260710120000

-- ── 1. Drop legacy / typo RPCs ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_derect_chat(uuid, uuid, app_mode, dm_source, uuid);
DROP FUNCTION IF EXISTS public.create_direct_chat(text, uuid, text);
-- Dev-only drift overload (legacy chats table); repo uses conversations stack.
DROP FUNCTION IF EXISTS public.create_event_chat(uuid, text);

-- ── 2. Allowlist sweep ───────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_allowlisted text[] := ARRAY[
    -- Romance
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
    -- Friends
    'friends_accept_request',
    'friends_decline_request',
    'friends_discover_feed',
    'friends_follow_profile',
    -- Business
    'business_accept_connection',
    'business_connect',
    'business_decline_connection',
    'business_discover_feed',
    'business_home_feed',
    'business_pending_invites_count',
    'business_profile_for_viewer',
    -- Events (join/leave defined in 20260710121000)
    'create_event_chat',
    'join_event',
    'leave_event',
    -- Chats / planner / contacts
    'create_direct_chat',
    'conversation_eligible_for_concierge_nudge',
    'dismiss_concierge_nudge',
    'ensure_group_conversation',
    'ensure_group_invite_code',
    'get_conversation_unread_counts',
    'join_group_by_code',
    'mark_messages_delivered',
    'match_contacts',
    -- Location
    'get_my_location_precision',
    'set_my_location',
    'set_my_location_precision',
    -- Analytics / AI cache / connections
    'record_business_analytics_event',
    'record_pair_behavior_signal',
    'remove_mode_connection',
    'set_cached_ai_plan',
    -- RLS expression helpers (not direct client RPCs, but authenticated needs EXECUTE)
    'is_dm_send_allowed',
    'is_group_member'
  ];
BEGIN
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
