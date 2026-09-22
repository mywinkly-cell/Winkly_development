-- ai_requests.meta — per-request attributes for the AI ledger.
--
-- "Surprise me" (winkly_plan with surprise: true) is billed against the same daily plan quota
-- as every other winkly_plan call, so it must stay task = 'winkly_plan'. To still tell the two
-- apart in analytics and cost reviews, ai-gateway records { "surprise": true, "cold_start": bool }
-- here. A JSONB column (rather than one column per feature) keeps later flags migration-free.
--
-- Written only by ai-gateway with the service role. ai-gateway falls back to inserting the row
-- without meta if this migration hasn't been applied yet, so quota counting never depends on it.
--
-- RLS: unchanged — ai_requests already has RLS enabled with the owner-only ai_requests_all policy.

ALTER TABLE public.ai_requests
  ADD COLUMN IF NOT EXISTS meta JSONB;

COMMENT ON COLUMN public.ai_requests.meta IS
  'Request attributes set by ai-gateway, e.g. {"surprise": true, "cold_start": false} for Surprise me. Analytics only — never used for access or quota decisions.';

-- Surprise-me share per day without scanning every row's JSON.
CREATE INDEX IF NOT EXISTS ai_requests_surprise_created_idx
  ON public.ai_requests (created_at DESC)
  WHERE (meta ->> 'surprise') = 'true';
