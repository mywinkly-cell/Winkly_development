-- A/B prompts and outcome tracking for concierge (add-to-planner rate, satisfaction).
-- prompt_variant: "A" | "B" for system prompt variant.
-- outcome: "added_to_planner" when user adds to planner.
-- outcome_satisfaction: "went_well" | "didnt_use" | "not_quite_right" from feedback modal.
ALTER TABLE public.ai_requests
  ADD COLUMN IF NOT EXISTS prompt_variant TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS outcome_satisfaction TEXT,
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ai_requests.prompt_variant IS 'A/B variant for system prompt (e.g. A=default, B=concise/vibe).';
COMMENT ON COLUMN public.ai_requests.outcome IS 'Client-reported: added_to_planner when user adds plan.';
COMMENT ON COLUMN public.ai_requests.outcome_satisfaction IS 'Client-reported from feedback: went_well, didnt_use, not_quite_right.';
COMMENT ON COLUMN public.ai_requests.outcome_at IS 'When outcome or outcome_satisfaction was set.';
