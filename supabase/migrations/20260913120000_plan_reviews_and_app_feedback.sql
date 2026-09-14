-- Two feedback loops:
-- 1) plan_reviews — lightweight post-plan review (rating + structured signals + free text),
--    captured once per (plan, user) after the plan's time has passed. Feeds behavior_pair_signals
--    (via record_pair_behavior_signal) and recompute-compatibility (learned activity tags), so
--    future suggestions for that user and their pairings improve.
-- 2) app_feedback — general "Send feedback" entries (rating + free text + screen/mode context)
--    for product improvement during the beta.

CREATE TABLE IF NOT EXISTS public.plan_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode planner_source NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  venue_good BOOLEAN,
  timing_good BOOLEAN,
  would_repeat BOOLEAN,
  note TEXT,
  activity_type TEXT,
  venue TEXT,
  time_of_day TEXT CHECK (time_of_day IS NULL OR time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planner_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS plan_reviews_user_id_idx ON public.plan_reviews(user_id);
CREATE INDEX IF NOT EXISTS plan_reviews_related_user_id_idx ON public.plan_reviews(related_user_id) WHERE related_user_id IS NOT NULL;

COMMENT ON TABLE public.plan_reviews IS
  'One quick post-plan review per (planner_item, user): rating + optional structured signals + free-text note, snapshotting the plan''s own attributes (activity/venue/time-of-day) so the signal stays learnable after the plan is edited or archived.';

ALTER TABLE public.plan_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_reviews_all ON public.plan_reviews;
CREATE POLICY plan_reviews_all ON public.plan_reviews FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND public.is_planner_participant(planner_item_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  note TEXT,
  screen TEXT,
  mode TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rating IS NOT NULL OR (note IS NOT NULL AND length(trim(note)) > 0))
);

CREATE INDEX IF NOT EXISTS app_feedback_user_id_idx ON public.app_feedback(user_id);

COMMENT ON TABLE public.app_feedback IS
  'Always-available general app feedback (settings + occasional prompt): rating and/or free text plus screen/mode context, for beta product review.';

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_feedback_all ON public.app_feedback;
CREATE POLICY app_feedback_all ON public.app_feedback FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fold post-plan review outcomes into pair affinity: a signed adjustment centered on a neutral
-- 3-star rating (no reviews yet => no adjustment), on top of the existing message/structured-signal
-- bonuses. Kept additive/backward-compatible: CREATE OR REPLACE with the same signature, so the
-- message trigger and recompute-behavior-ml (which only reads the resulting affinity_score) need
-- no changes of their own.
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
      + CASE
          WHEN COALESCE((p_signals->>'plan_review_count')::integer, 0) > 0 THEN
            (
              (
                COALESCE((p_signals->>'plan_review_rating_sum')::double precision, 0)
                / COALESCE((p_signals->>'plan_review_count')::double precision, 1)
              ) - 3.0
            ) / 2.0 * 0.15
          ELSE 0.0
        END
    )
  );
$$;

-- Extend the client-callable structured-signal RPC with a 'plan_reviewed' kind, so a post-plan
-- review recorded for a 1:1 plan (romance date, or a friend/business plan invited from chat)
-- immediately refreshes that pair's affinity_score via compute_behavior_affinity_score above.
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

GRANT EXECUTE ON FUNCTION public.record_pair_behavior_signal(UUID, app_mode, TEXT, JSONB) TO authenticated;
