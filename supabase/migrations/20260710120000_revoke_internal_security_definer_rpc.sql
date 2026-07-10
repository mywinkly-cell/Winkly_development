-- Security Advisor lint 0029 — revoke direct /rpc on internal SECURITY DEFINER helpers.
--
-- Client-facing RPCs (discover feeds, likes, chats, planner, etc.) intentionally remain
-- callable by `authenticated` and will still appear in the advisor until moved to a
-- private schema or converted to SECURITY INVOKER with equivalent RLS.
--
-- This migration removes PostgREST exposure for:
--   * edge-function / cron entrypoints (service_role only)
--   * romance invite internals (called from romance_like_profile)
--   * legacy / unused RPCs superseded by table writes or newer APIs
--   * typo alias create_derect_chat and legacy create_direct_chat overload

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      -- Edge / cron (service_role only)
      'public.confirm_pending_plan(uuid)',
      'public.confirm_pending_plan_host(uuid)',
      'public.match_events_for_concierge(text, text, timestamp with time zone, timestamp with time zone, integer)',
      -- Romance invite internals (romance_like_profile only)
      'public.romance_insert_invite_opener(uuid, uuid, text)',
      'public.romance_ensure_pending_invite_chat(uuid, uuid, text)',
      -- Trigger / notify helpers (not client RPCs)
      'public.create_notification(uuid, text, text, text, jsonb, uuid)',
      -- Legacy friends RPCs (app uses friends_requests table + friends_accept/decline_request)
      'public.send_friend_request(uuid, text)',
      'public.cancel_friend_request(uuid)',
      'public.respond_friend_request(uuid, text)',
      'public.unfriend(uuid)',
      -- Legacy swipe RPC (app uses user_swipes table)
      'public.romance_record_swipe(uuid, romance_swipe_action, jsonb)',
      -- In-app notifications inbox uses notifications table directly
      'public.mark_notification_read(uuid)',
      'public.mark_all_notifications_read()',
      -- Search RPCs not wired in mobile (business feeds use business_*_feed)
      'public.search_users(text, text, integer, integer)',
      'public.search_users(text, text, integer, integer, text[], text[])',
      'public.search_friends(text, integer, integer)',
      'public.search_events(text, integer, integer)',
      'public.search_companies(text, integer, integer)',
      'public.search_business_people(text, integer, integer)',
      -- Orphan helpers (not used in RLS or client)
      'public.can_access_event_chat(uuid, uuid)',
      'public.get_event_conversation_id(uuid)',
      'public.group_member_count(uuid)'
    ]::text[]) AS signature
  LOOP
    IF to_regprocedure(r.signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        r.signature
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        r.signature
      );
    END IF;
  END LOOP;
END $$;

-- Typo alias — mobile uses create_direct_chat (5-arg). Safe to remove.
DROP FUNCTION IF EXISTS public.create_derect_chat(uuid, uuid, app_mode, dm_source, uuid);

-- Legacy 3-arg overload superseded by create_direct_chat(uuid, uuid, app_mode, dm_source, uuid).
DROP FUNCTION IF EXISTS public.create_direct_chat(text, uuid, text);
