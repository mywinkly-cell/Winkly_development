-- Richer DM behavior signals + Friends follow RPC + friends_discover_feed fixes

-- 1) Extend behavior_pair_signals with structured interaction counters / aggregates
ALTER TABLE public.behavior_pair_signals
  ADD COLUMN IF NOT EXISTS interaction_signals JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.behavior_pair_signals.interaction_signals IS
  'JSON counters: total_chars, reply_* , concierge_sessions, planner_from_chat, invites_accepted, dm_first_outreach flags, etc.';

-- 2) Recompute affinity from message_count + interaction_signals bonuses
CREATE OR REPLACE FUNCTION public.compute_behavior_affinity_score(
  p_message_count INTEGER,
  p_signals JSONB
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(
    1.0::double precision,
    GREATEST(
      0.05::double precision,
      (0.32::double precision + LN(1.0 + GREATEST(COALESCE(p_message_count, 0), 0)::double precision) / 3.8::double precision)
      + LEAST(
          0.18::double precision,
          COALESCE((p_signals->>'concierge_sessions')::integer, 0)::double precision * 0.025
          + COALESCE((p_signals->>'planner_from_chat')::integer, 0)::double precision * 0.03
          + COALESCE((p_signals->>'invites_accepted')::integer, 0)::double precision * 0.028
          + CASE WHEN COALESCE((p_signals->>'dm_first_outreach')::integer, 0) >= 1 THEN 0.04 ELSE 0 END
          + LEAST(
              0.06::double precision,
              LN(1.0 + GREATEST(COALESCE((p_signals->>'total_chars')::bigint, 0), 0)::double precision) / 45.0
            )
        )
    )
  );
$$;

-- 3) Message trigger: character volume + reply latency sample + affinity refresh
CREATE OR REPLACE FUNCTION public.apply_message_behavior_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_mode app_mode;
  conv_type conversation_type;
  other_uid UUID;
  ua UUID;
  ub UUID;
  mc INTEGER;
  prev_ts TIMESTAMPTZ;
  gap_sec DOUBLE PRECISION;
  sig JSONB;
  chars BIGINT;
  samples INTEGER;
  sum_sec DOUBLE PRECISION;
BEGIN
  SELECT c.type, c.mode INTO conv_type, conv_mode
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF conv_type IS DISTINCT FROM 'dm'::conversation_type THEN
    RETURN NEW;
  END IF;
  IF conv_mode NOT IN ('romance'::app_mode, 'friends'::app_mode, 'business'::app_mode) THEN
    RETURN NEW;
  END IF;

  SELECT cm.user_id INTO other_uid
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id
    AND cm.user_id <> NEW.sender_id
    AND cm.left_at IS NULL
  LIMIT 1;

  IF other_uid IS NULL THEN
    RETURN NEW;
  END IF;

  ua := LEAST(NEW.sender_id, other_uid);
  ub := GREATEST(NEW.sender_id, other_uid);

  chars := GREATEST(0, length(COALESCE(NEW.content, '')));

  SELECT MAX(m.created_at) INTO prev_ts
  FROM public.messages m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.sender_id <> NEW.sender_id
    AND m.created_at < NEW.created_at;

  gap_sec := NULL;
  IF prev_ts IS NOT NULL THEN
    gap_sec := EXTRACT(EPOCH FROM (NEW.created_at - prev_ts))::double precision;
    IF gap_sec < 0 OR gap_sec > 864000 THEN gap_sec := NULL; END IF;
  END IF;

  INSERT INTO public.behavior_pair_signals (
    user_a_id, user_b_id, mode, message_count, last_message_at, affinity_score, interaction_signals, updated_at
  )
  VALUES (
    ua,
    ub,
    conv_mode,
    1,
    NEW.created_at,
    0.5,
    jsonb_build_object(
      'total_chars',
      chars::bigint,
      'reply_latency_samples',
      CASE WHEN gap_sec IS NOT NULL THEN 1 ELSE 0 END,
      'reply_latency_sum_sec',
      COALESCE(gap_sec, 0::double precision)
    ),
    now()
  )
  ON CONFLICT (user_a_id, user_b_id, mode)
  DO UPDATE SET
    message_count = public.behavior_pair_signals.message_count + 1,
    last_message_at = NEW.created_at,
    interaction_signals = COALESCE(public.behavior_pair_signals.interaction_signals, '{}'::jsonb)
      || jsonb_build_object(
           'total_chars',
           COALESCE((public.behavior_pair_signals.interaction_signals->>'total_chars')::bigint, 0) + chars,
           'reply_latency_samples',
           COALESCE((public.behavior_pair_signals.interaction_signals->>'reply_latency_samples')::integer, 0)
             + CASE WHEN gap_sec IS NOT NULL THEN 1 ELSE 0 END,
           'reply_latency_sum_sec',
           COALESCE((public.behavior_pair_signals.interaction_signals->>'reply_latency_sum_sec')::double precision, 0)
             + COALESCE(gap_sec, 0::double precision)
         ),
    updated_at = now()
  RETURNING message_count, interaction_signals INTO mc, sig;

  UPDATE public.behavior_pair_signals
  SET
    affinity_score = public.compute_behavior_affinity_score(mc, COALESCE(sig, '{}'::jsonb)),
    updated_at = now()
  WHERE user_a_id = ua AND user_b_id = ub AND mode = conv_mode;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_behavior_signal ON public.messages;
CREATE TRIGGER trg_messages_behavior_signal
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_message_behavior_signal();

-- 4) Client-callable structured signals (concierge, planner-from-chat, invite accepted, first outreach)
CREATE OR REPLACE FUNCTION public.record_pair_behavior_signal(
  p_partner_user_id UUID,
  p_mode public.app_mode,
  p_kind TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.record_pair_behavior_signal(UUID, app_mode, TEXT, JSONB) TO authenticated;

-- 5) Friends follow — returns chat_id when mutual connection forms (mirrors romance_like_profile)
CREATE OR REPLACE FUNCTION public.friends_follow_profile(
  current_user_id UUID,
  target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mutual BOOLEAN;
  v_chat_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'friends_follow_profile: forbidden';
  END IF;

  IF current_user_id = target_user_id THEN
    RETURN jsonb_build_object('followed', false, 'is_connection', false, 'error', 'Cannot follow yourself');
  END IF;

  INSERT INTO public.follows (follower_id, followee_id)
  VALUES (current_user_id, target_user_id)
  ON CONFLICT (follower_id, followee_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.follows f1
    JOIN public.follows f2 ON f1.follower_id = f2.followee_id AND f1.followee_id = f2.follower_id
    WHERE f1.follower_id = current_user_id AND f1.followee_id = target_user_id
  ) INTO mutual;

  IF mutual THEN
    v_chat_id := public.create_direct_chat(
      current_user_id,
      target_user_id,
      'friends'::app_mode,
      'connection'::dm_source,
      current_user_id
    );
    RETURN jsonb_build_object('followed', true, 'is_connection', true, 'chat_id', v_chat_id);
  END IF;

  RETURN jsonb_build_object('followed', true, 'is_connection', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.friends_follow_profile(UUID, UUID) TO authenticated;

-- 6) Fix friends_discover_feed: use user_id for identity; exclude already-followed
CREATE OR REPLACE FUNCTION public.friends_discover_feed(current_user_id UUID, p_limit INT DEFAULT 100)
RETURNS SETOF public.friend_profiles
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'friends_discover_feed: forbidden'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
    SELECT fp.*
    FROM public.friend_profiles fp
    WHERE fp.user_id IS NOT NULL
      AND fp.user_id <> current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = fp.user_id)
           OR (ub.blocker_id = fp.user_id AND ub.blocked_id = current_user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_swipes us
        WHERE us.user_id = current_user_id
          AND us.target_user_id = fp.user_id
          AND us.mode = 'friends'
          AND us.action = 'pass'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.follows fo
        WHERE fo.follower_id = current_user_id AND fo.followee_id = fp.user_id
      )
    ORDER BY fp.updated_at DESC NULLS LAST, fp.created_at DESC NULLS LAST
    LIMIT greatest(0, least(coalesce(p_limit, 100), 200));
END;
$$;
