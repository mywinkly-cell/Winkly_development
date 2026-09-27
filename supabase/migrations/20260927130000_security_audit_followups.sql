-- ─────────────────────────────────────────────────────────────────────────────
-- September 2026 security audit — follow-ups.
-- Regression test: supabase/tests/security_audit_2026_09_test.sql
--
-- SEC-10 Calendar connection hijack. The OAuth `state` carried the uid of
--        whoever started the flow and was not tied to the device finishing it:
--        an attacker could send a victim their own consent link, and if the
--        victim approved, the victim's Google/Outlook calendar was attached to
--        the attacker's account. The callback now parks the encrypted tokens here
--        under a one-time completion code that is only delivered to the browser
--        that finished consent; the app then activates them with the SAME user's
--        session (calendar-oauth-start?action=complete). An attacker never sees
--        the code, and a victim's session can't activate the attacker's row.
--
-- SEC-11 Smaller hardening:
--        • business-logos: the app never uploads there (pickAndUploadLogo has no
--          callers), but any user could still write public, unmoderated files into
--          it. Client INSERT/UPDATE removed; owners can still read/delete.
--        • record_pair_behavior_signal: only between users who share an active
--          conversation, so strangers can't inflate their matching affinity.
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_oauth_pending (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  code_hash        text NOT NULL UNIQUE,
  token_encrypted  text NOT NULL,
  token_expires_at timestamptz,
  scopes           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.calendar_oauth_pending IS
  'Calendar OAuth tokens awaiting activation by the same user (SEC-10). Service role only; rows are single-use and expire after 10 minutes.';

CREATE INDEX IF NOT EXISTS calendar_oauth_pending_created_at_idx ON public.calendar_oauth_pending (created_at);

-- Service role only: RLS on with no policies, and no grants to client roles.
ALTER TABLE public.calendar_oauth_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_oauth_pending FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calendar_oauth_pending TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-11 · business-logos: no client writes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "business-logos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "business-logos_owner_update" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-11 · behaviour signals only between people who share a chat
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.shares_active_conversation(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members a
    JOIN public.conversation_members b
      ON b.conversation_id = a.conversation_id AND b.user_id = p_b AND b.left_at IS NULL
    WHERE a.user_id = p_a AND a.left_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION private.shares_active_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.shares_active_conversation(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_pair_behavior_signal(p_partner_user_id uuid, p_mode app_mode, p_kind text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  uid UUID := auth.uid();
  ua UUID;
  ub UUID;
  mc INTEGER;
  sig JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_partner_user_id IS NULL OR p_partner_user_id = uid THEN
    RETURN;
  END IF;
  IF p_mode NOT IN ('romance'::app_mode, 'friends'::app_mode, 'business'::app_mode) THEN
    RETURN;
  END IF;
  -- Only between people who actually share a chat (every client caller does:
  -- first DM, plan from chat, accepted invite, post-plan review). Without this any
  -- user could raise their affinity score with any stranger (SEC-11).
  IF NOT private.shares_active_conversation(uid, p_partner_user_id) THEN
    RETURN;
  END IF;

  ua := LEAST(uid, p_partner_user_id);
  ub := GREATEST(uid, p_partner_user_id);

  INSERT INTO public.behavior_pair_signals (
    user_a_id, user_b_id, mode, message_count, last_message_at, affinity_score, interaction_signals, updated_at
  )
  VALUES (ua, ub, p_mode, 0, NULL, 0.5, '{}'::jsonb, now())
  ON CONFLICT (user_a_id, user_b_id, mode) DO NOTHING;

  SELECT message_count, interaction_signals INTO mc, sig
  FROM public.behavior_pair_signals
  WHERE user_a_id = ua AND user_b_id = ub AND mode = p_mode;

  mc := COALESCE(mc, 0);
  sig := COALESCE(sig, '{}'::jsonb);

  IF p_kind = 'concierge_match_session' THEN
    sig := sig || jsonb_build_object(
      'concierge_sessions',
      COALESCE((sig->>'concierge_sessions')::integer, 0) + 1,
      'last_concierge_at',
      to_jsonb(now())
    );
  ELSIF p_kind = 'planner_from_chat' THEN
    sig := sig || jsonb_build_object(
      'planner_from_chat',
      COALESCE((sig->>'planner_from_chat')::integer, 0) + 1,
      'last_planner_from_chat_at',
      to_jsonb(now())
    );
    IF p_payload ? 'conversation_id' THEN
      sig := sig || jsonb_build_object('last_planner_conversation_id', p_payload->'conversation_id');
    END IF;
  ELSIF p_kind = 'invite_accepted' THEN
    sig := sig || jsonb_build_object(
      'invites_accepted',
      COALESCE((sig->>'invites_accepted')::integer, 0) + 1,
      'last_invite_accepted_at',
      to_jsonb(now())
    );
  ELSIF p_kind = 'dm_first_outreach' THEN
    sig := sig || jsonb_build_object(
      'dm_first_outreach',
      GREATEST(COALESCE((sig->>'dm_first_outreach')::integer, 0), 1)
    );
  ELSIF p_kind = 'plan_reviewed' THEN
    sig := sig || jsonb_build_object(
      'plan_review_count',
      COALESCE((sig->>'plan_review_count')::integer, 0) + 1,
      'plan_review_rating_sum',
      COALESCE((sig->>'plan_review_rating_sum')::numeric, 0) + LEAST(GREATEST(COALESCE((p_payload->>'rating')::numeric, 3), 1), 5),
      'last_plan_review_at',
      to_jsonb(now())
    );
    IF (p_payload->>'would_repeat') IS NOT NULL THEN
      sig := sig || jsonb_build_object('last_plan_review_would_repeat', (p_payload->>'would_repeat')::boolean);
    END IF;
  ELSE
    RETURN;
  END IF;

  UPDATE public.behavior_pair_signals
  SET
    interaction_signals = sig,
    affinity_score = public.compute_behavior_affinity_score(mc, sig),
    updated_at = now()
  WHERE user_a_id = ua AND user_b_id = ub AND mode = p_mode;
END;
$$;
