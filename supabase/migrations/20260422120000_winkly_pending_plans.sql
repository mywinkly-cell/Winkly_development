-- Winkly Concierge Agent — Pending plans + multi-participant confirmations + pivot support
-- April 2026

-- 1) Pending plans (LLM-generated draft plan awaiting confirmations)
CREATE TABLE IF NOT EXISTS public.pending_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_mode public.planner_source NOT NULL,
  participant_ids UUID[] NOT NULL,
  -- Strict JSON shape is enforced in ai-gateway before insert.
  plan_json JSONB NOT NULL,
  -- Optional link to a planner item once finalized (created on all-confirmed).
  planner_item_id UUID REFERENCES public.planner_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'pivot_pending', 'pivot_confirmed')),
  pivot_of UUID REFERENCES public.pending_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_plans_created_by ON public.pending_plans(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_plans_status_time ON public.pending_plans(status, created_at DESC);

COMMENT ON TABLE public.pending_plans IS 'Draft concierge plans awaiting multi-user confirmation; finalization creates planner_items + participants.';

ALTER TABLE public.pending_plans ENABLE ROW LEVEL SECURITY;

-- Created_by or participant can read; created_by can insert; created_by can update/cancel until confirmed.
DROP POLICY IF EXISTS pending_plans_select ON public.pending_plans;
CREATE POLICY pending_plans_select ON public.pending_plans FOR SELECT USING (
  auth.uid() = created_by OR auth.uid() = ANY(participant_ids)
);
DROP POLICY IF EXISTS pending_plans_insert ON public.pending_plans;
CREATE POLICY pending_plans_insert ON public.pending_plans FOR INSERT WITH CHECK (
  auth.uid() = created_by AND auth.uid() = ANY(participant_ids)
);
DROP POLICY IF EXISTS pending_plans_update ON public.pending_plans;
CREATE POLICY pending_plans_update ON public.pending_plans FOR UPDATE USING (
  auth.uid() = created_by AND status IN ('pending', 'pivot_pending')
);

GRANT SELECT, INSERT, UPDATE ON public.pending_plans TO authenticated;

-- 2) Confirmations (one row per user per plan; all-confirmed when count == array_length(participant_ids))
CREATE TABLE IF NOT EXISTS public.pending_plan_confirmations (
  pending_plan_id UUID NOT NULL REFERENCES public.pending_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pending_plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_plan_confirmations_user ON public.pending_plan_confirmations(user_id, confirmed_at DESC);

COMMENT ON TABLE public.pending_plan_confirmations IS 'Per-user confirmation of a pending plan (double/multi opt-in).';

ALTER TABLE public.pending_plan_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_plan_confirmations_select ON public.pending_plan_confirmations;
CREATE POLICY pending_plan_confirmations_select ON public.pending_plan_confirmations FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.pending_plans p
    WHERE p.id = pending_plan_confirmations.pending_plan_id
      AND (auth.uid() = p.created_by OR auth.uid() = ANY(p.participant_ids))
  )
);
DROP POLICY IF EXISTS pending_plan_confirmations_insert ON public.pending_plan_confirmations;
CREATE POLICY pending_plan_confirmations_insert ON public.pending_plan_confirmations FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.pending_plans p
    WHERE p.id = pending_plan_confirmations.pending_plan_id
      AND auth.uid() = ANY(p.participant_ids)
      AND p.status IN ('pending', 'pivot_pending')
  )
);

GRANT SELECT, INSERT ON public.pending_plan_confirmations TO authenticated;

-- 3) Helper view: confirmation counts
CREATE OR REPLACE VIEW public.pending_plans_with_confirmation_counts AS
SELECT
  p.*,
  COALESCE(c.confirmed_count, 0) AS confirmed_count,
  COALESCE(array_length(p.participant_ids, 1), 0)::int AS participant_count,
  (COALESCE(c.confirmed_count, 0) >= COALESCE(array_length(p.participant_ids, 1), 0) AND COALESCE(array_length(p.participant_ids, 1), 0) > 0) AS all_participants_confirmed
FROM public.pending_plans p
LEFT JOIN (
  SELECT
    pc.pending_plan_id,
    COUNT(*)::int AS confirmed_count
  FROM public.pending_plan_confirmations pc
  GROUP BY pc.pending_plan_id
) c ON c.pending_plan_id = p.id;

-- Note: participant_count is computed in RPC below for correctness (array_length).
COMMENT ON VIEW public.pending_plans_with_confirmation_counts IS 'Convenience view; use RPC for exact all-confirmed check.';

-- 4) RPC: confirm a plan (idempotent) and return all-confirmed boolean
CREATE OR REPLACE FUNCTION public.confirm_pending_plan(p_plan_id UUID)
RETURNS TABLE (
  pending_plan_id UUID,
  confirmed_count INT,
  participant_count INT,
  all_participants_confirmed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID := p_plan_id;
  p_row public.pending_plans%ROWTYPE;
  cc INT;
  pc INT;
BEGIN
  SELECT * INTO p_row FROM public.pending_plans WHERE id = pid;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Must be a participant
  IF NOT (auth.uid() = ANY(p_row.participant_ids)) THEN
    RETURN;
  END IF;
  IF p_row.status NOT IN ('pending', 'pivot_pending') THEN
    RETURN;
  END IF;

  INSERT INTO public.pending_plan_confirmations (pending_plan_id, user_id)
  VALUES (pid, auth.uid())
  ON CONFLICT (pending_plan_id, user_id) DO NOTHING;

  SELECT COUNT(*)::int INTO cc FROM public.pending_plan_confirmations WHERE pending_plan_id = pid;
  SELECT COALESCE(array_length(p_row.participant_ids, 1), 0)::int INTO pc;

  pending_plan_id := pid;
  confirmed_count := cc;
  participant_count := pc;
  all_participants_confirmed := (pc > 0 AND cc >= pc);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pending_plan(UUID) TO authenticated;

