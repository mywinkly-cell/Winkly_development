-- Behavior-based matching signals, photo verification, date safety check-ins,
-- rich profile fields (voice / video bio / lifestyle tags), icebreaker message type.
-- Integrates with existing compatibility_scores + romance discover (client merges scores).

-- 1. Message type: icebreaker (structured JSON in content + optional attachments)
DO $$ BEGIN
  ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'icebreaker';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Enums for verification + check-ins
DO $$ BEGIN
  CREATE TYPE photo_verification_status AS ENUM ('pending', 'verified', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE date_checkin_status AS ENUM ('scheduled', 'ok', 'needs_help', 'missed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Pair-level messaging behavior (canonical user_a < user_b)
CREATE TABLE IF NOT EXISTS public.behavior_pair_signals (
  user_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode app_mode NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  last_message_at TIMESTAMPTZ,
  affinity_score DOUBLE PRECISION NOT NULL DEFAULT 0.5
    CHECK (affinity_score >= 0 AND affinity_score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id, mode),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS behavior_pair_signals_user_a ON public.behavior_pair_signals (user_a_id, mode);
CREATE INDEX IF NOT EXISTS behavior_pair_signals_user_b ON public.behavior_pair_signals (user_b_id, mode);

COMMENT ON TABLE public.behavior_pair_signals IS
  'DM-derived signals for ML/ranking; affinity_score updated on message insert + batch jobs.';

ALTER TABLE public.behavior_pair_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS behavior_pair_select_own ON public.behavior_pair_signals;
CREATE POLICY behavior_pair_select_own ON public.behavior_pair_signals
  FOR SELECT USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 4. Optional ML / cache hook on compatibility row (filled by Edge job or SageMaker export)
ALTER TABLE public.compatibility_scores
  ADD COLUMN IF NOT EXISTS behavior_affinity DOUBLE PRECISION
    DEFAULT 0.5 CHECK (behavior_affinity IS NULL OR (behavior_affinity >= 0 AND behavior_affinity <= 1)),
  ADD COLUMN IF NOT EXISTS ml_rank_score DOUBLE PRECISION
    DEFAULT NULL;

COMMENT ON COLUMN public.compatibility_scores.behavior_affinity IS
  'Copy of or blend with behavior_pair_signals.affinity_score for fast joins.';
COMMENT ON COLUMN public.compatibility_scores.ml_rank_score IS
  'Optional hosted ML model score (e.g. SageMaker); null until pipeline runs.';

-- 5. Photo verification attempts (AI / vendor compares selfie to profile photo)
CREATE TABLE IF NOT EXISTS public.profile_photo_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status photo_verification_status NOT NULL DEFAULT 'pending',
  selfie_storage_path TEXT,
  profile_photo_index INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  similarity_score DOUBLE PRECISION,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_photo_verifications_user ON public.profile_photo_verifications (user_id, created_at DESC);

ALTER TABLE public.profile_photo_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_verifications_own ON public.profile_photo_verifications;
CREATE POLICY photo_verifications_own ON public.profile_photo_verifications
  FOR ALL USING (auth.uid() = user_id);

-- 6. Core profile: verified badge timestamp
ALTER TABLE public.profiles_core
  ADD COLUMN IF NOT EXISTS photo_verified_at TIMESTAMPTZ;

-- 7. Rich sub-profile fields (Romance/Friends; optional for Business)
ALTER TABLE public.profiles_mode
  ADD COLUMN IF NOT EXISTS lifestyle_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS voice_prompt_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_prompt_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS video_bio_url TEXT,
  ADD COLUMN IF NOT EXISTS video_poster_url TEXT;

-- 8. Date safety check-ins (planner-linked when available)
CREATE TABLE IF NOT EXISTS public.date_safety_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  planner_item_id UUID REFERENCES public.planner_items(id) ON DELETE SET NULL,
  status date_checkin_status NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  checkin_due_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS date_safety_checkins_user ON public.date_safety_checkins (user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS date_safety_checkins_planner ON public.date_safety_checkins (planner_item_id);

ALTER TABLE public.date_safety_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS date_checkins_own ON public.date_safety_checkins;
CREATE POLICY date_checkins_own ON public.date_safety_checkins
  FOR ALL USING (auth.uid() = user_id);

-- 9. SECURITY DEFINER: increment behavior from DM messages (bypasses RLS for insert)
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
  aff DOUBLE PRECISION;
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

  INSERT INTO public.behavior_pair_signals (
    user_a_id, user_b_id, mode, message_count, last_message_at, affinity_score, updated_at
  )
  VALUES (ua, ub, conv_mode, 1, now(), 0.5, now())
  ON CONFLICT (user_a_id, user_b_id, mode)
  DO UPDATE SET
    message_count = public.behavior_pair_signals.message_count + 1,
    last_message_at = EXCLUDED.last_message_at,
    updated_at = EXCLUDED.updated_at
  RETURNING message_count INTO mc;

  aff := LEAST(1.0::double precision, 0.32::double precision + LN(1.0 + COALESCE(mc, 1)::double precision) / 3.8);

  UPDATE public.behavior_pair_signals
  SET affinity_score = aff, updated_at = now()
  WHERE user_a_id = ua AND user_b_id = ub AND mode = conv_mode;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_behavior_signal ON public.messages;
CREATE TRIGGER trg_messages_behavior_signal
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_message_behavior_signal();

-- 10. RPC: batch affinity for discover ranking (Romance uses mode = romance)
CREATE OR REPLACE FUNCTION public.get_behavior_affinities(
  p_user_id UUID,
  p_candidate_ids UUID[],
  p_mode app_mode
)
RETURNS TABLE (other_user_id UUID, affinity DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    COALESCE(bps.affinity_score, 0.5::double precision)::double precision
  FROM unnest(p_candidate_ids) AS c(id)
  LEFT JOIN public.behavior_pair_signals bps ON
    bps.mode = p_mode
    AND bps.user_a_id = LEAST(p_user_id, c.id)
    AND bps.user_b_id = GREATEST(p_user_id, c.id);
$$;

GRANT EXECUTE ON FUNCTION public.get_behavior_affinities(UUID, UUID[], app_mode) TO authenticated;
