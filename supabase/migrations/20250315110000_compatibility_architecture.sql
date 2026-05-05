-- Scalable AI Compatibility + Experience Suggestion architecture
-- Layer 1: Precomputed compatibility (pgvector + scores). Layer 2: On-demand AI with cache.
-- No LLM in Layer 1; embeddings for similarity; compatibility_scores + ai_plan_cache.

-- 1. Enable pgvector (required for embedding similarity)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Profile embeddings (one combined embedding per user per mode for similarity search)
-- Embedding generated from: interests + activity_preferences + lifestyle (text).
-- Dimension 384: e.g. all-MiniLM-L6-v2 / sentence-transformers; use 1536 if using OpenAI text-embedding-3-small
CREATE TABLE IF NOT EXISTS public.profile_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode app_mode NOT NULL,
  embedding vector(384),
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

CREATE INDEX IF NOT EXISTS profile_embeddings_user_mode ON public.profile_embeddings (user_id, mode);
-- ivfflat index for similarity search: add when table has rows (e.g. CREATE INDEX ... WITH (lists = 100) after backfill)
COMMENT ON TABLE public.profile_embeddings IS 'Precomputed embeddings for interests+activity+lifestyle; used for similarity search without LLM.';

-- 3. Compatibility scores (precomputed; updated by background job)
-- Canonical ordering: user_a_id < user_b_id to avoid duplicate pairs
CREATE TABLE IF NOT EXISTS public.compatibility_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode app_mode NOT NULL,
  compatibility_score DOUBLE PRECISION NOT NULL CHECK (compatibility_score >= 0 AND compatibility_score <= 1),
  shared_interest_tags TEXT[] DEFAULT '{}',
  shared_activity_tags TEXT[] DEFAULT '{}',
  budget_overlap BOOLEAN NOT NULL DEFAULT false,
  location_proximity_bucket TEXT,
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a_id, user_b_id, mode),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS compatibility_scores_user_a ON public.compatibility_scores (user_a_id, mode);
CREATE INDEX IF NOT EXISTS compatibility_scores_user_b ON public.compatibility_scores (user_b_id, mode);
CREATE INDEX IF NOT EXISTS compatibility_scores_updated ON public.compatibility_scores (updated_at DESC);

COMMENT ON TABLE public.compatibility_scores IS 'Precomputed compatibility (no LLM). Updated by background job on profile/interest/preference/location change.';

-- 4. AI plan cache (Layer 2: cache LLM-generated plans 12–24h)
-- Canonical key: user_a_id < user_b_id, mode
CREATE TABLE IF NOT EXISTS public.ai_plan_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode app_mode NOT NULL,
  plan_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a_id, user_b_id, mode),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS ai_plan_cache_lookup ON public.ai_plan_cache (user_a_id, user_b_id, mode);
CREATE INDEX IF NOT EXISTS ai_plan_cache_generated ON public.ai_plan_cache (generated_at DESC);

COMMENT ON TABLE public.ai_plan_cache IS 'Cache for AI-generated experience plans; TTL 12–24h. Reuse when user reopens same chat.';

-- 5. RLS
ALTER TABLE public.profile_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compatibility_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_cache ENABLE ROW LEVEL SECURITY;

-- profile_embeddings: user can read/insert/update own rows (service role writes from Edge Function)
DROP POLICY IF EXISTS profile_embeddings_own ON public.profile_embeddings;
CREATE POLICY profile_embeddings_own ON public.profile_embeddings
  FOR ALL USING (auth.uid() = user_id);

-- compatibility_scores: user can read rows where they are user_a or user_b
DROP POLICY IF EXISTS compatibility_scores_read ON public.compatibility_scores;
CREATE POLICY compatibility_scores_read ON public.compatibility_scores
  FOR SELECT USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- ai_plan_cache: user can read/insert/update rows where they are user_a or user_b
DROP POLICY IF EXISTS ai_plan_cache_own ON public.ai_plan_cache;
CREATE POLICY ai_plan_cache_own ON public.ai_plan_cache
  FOR ALL USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 6. Helper to get canonical (user_a, user_b) for a pair
-- Application layer should pass (min(a,b), max(a,b)); DB enforces a < b.

-- 7. Function: upsert compatibility for one pair (called by background job)
CREATE OR REPLACE FUNCTION public.upsert_compatibility_score(
  p_user_a_id UUID,
  p_user_b_id UUID,
  p_mode app_mode,
  p_compatibility_score DOUBLE PRECISION,
  p_shared_interest_tags TEXT[] DEFAULT '{}',
  p_shared_activity_tags TEXT[] DEFAULT '{}',
  p_budget_overlap BOOLEAN DEFAULT false,
  p_location_proximity_bucket TEXT DEFAULT NULL,
  p_confidence_score DOUBLE PRECISION DEFAULT 0.5
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ua UUID := LEAST(p_user_a_id, p_user_b_id);
  ub UUID := GREATEST(p_user_a_id, p_user_b_id);
BEGIN
  INSERT INTO public.compatibility_scores (
    user_a_id, user_b_id, mode, compatibility_score,
    shared_interest_tags, shared_activity_tags, budget_overlap,
    location_proximity_bucket, confidence_score, updated_at
  ) VALUES (
    ua, ub, p_mode, p_compatibility_score,
    p_shared_interest_tags, p_shared_activity_tags, p_budget_overlap,
    p_location_proximity_bucket, p_confidence_score, now()
  )
  ON CONFLICT (user_a_id, user_b_id, mode)
  DO UPDATE SET
    compatibility_score = EXCLUDED.compatibility_score,
    shared_interest_tags = EXCLUDED.shared_interest_tags,
    shared_activity_tags = EXCLUDED.shared_activity_tags,
    budget_overlap = EXCLUDED.budget_overlap,
    location_proximity_bucket = EXCLUDED.location_proximity_bucket,
    confidence_score = EXCLUDED.confidence_score,
    updated_at = now();
END;
$$;

-- 8. Function: get compatibility for a pair (returns single row or null)
CREATE OR REPLACE FUNCTION public.get_compatibility_score(
  p_user_id UUID,
  p_other_user_id UUID,
  p_mode app_mode
)
RETURNS TABLE (
  compatibility_score DOUBLE PRECISION,
  shared_interest_tags TEXT[],
  shared_activity_tags TEXT[],
  budget_overlap BOOLEAN,
  location_proximity_bucket TEXT,
  confidence_score DOUBLE PRECISION,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.compatibility_score,
    c.shared_interest_tags,
    c.shared_activity_tags,
    c.budget_overlap,
    c.location_proximity_bucket,
    c.confidence_score,
    c.updated_at
  FROM public.compatibility_scores c
  WHERE c.user_a_id = LEAST(p_user_id, p_other_user_id)
    AND c.user_b_id = GREATEST(p_user_id, p_other_user_id)
    AND c.mode = p_mode
  LIMIT 1;
$$;

-- 9. Function: get cached AI plan if not expired (e.g. 24h)
CREATE OR REPLACE FUNCTION public.get_cached_ai_plan(
  p_user_id UUID,
  p_other_user_id UUID,
  p_mode app_mode,
  p_ttl_hours INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT cache.plan_json
  FROM public.ai_plan_cache cache
  WHERE cache.user_a_id = LEAST(p_user_id, p_other_user_id)
    AND cache.user_b_id = GREATEST(p_user_id, p_other_user_id)
    AND cache.mode = p_mode
    AND cache.generated_at > (now() - (p_ttl_hours || ' hours')::interval)
  LIMIT 1;
$$;

-- 10. Function: set cached AI plan
CREATE OR REPLACE FUNCTION public.set_cached_ai_plan(
  p_user_id UUID,
  p_other_user_id UUID,
  p_mode app_mode,
  p_plan_json JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ua UUID := LEAST(p_user_id, p_other_user_id);
  ub UUID := GREATEST(p_user_id, p_other_user_id);
BEGIN
  INSERT INTO public.ai_plan_cache (user_a_id, user_b_id, mode, plan_json, generated_at)
  VALUES (ua, ub, p_mode, p_plan_json, now())
  ON CONFLICT (user_a_id, user_b_id, mode)
  DO UPDATE SET plan_json = EXCLUDED.plan_json, generated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_compatibility_score TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_compatibility_score TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compatibility_score TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cached_ai_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cached_ai_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cached_ai_plan TO service_role;

-- Allow recompute-compatibility Edge Function (service_role) to call romance_connections for scoped recompute
GRANT EXECUTE ON FUNCTION public.romance_connections(UUID) TO service_role;
