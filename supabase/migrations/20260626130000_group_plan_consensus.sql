-- Group plan consensus (TB-2.6):
--   * pending_plan_reactions: per-member 👍/🤔/👎 per A/B option
--   * confirm_pending_plan_host: host (creator) locks in the plan for the whole
--     group in one tap (records confirmations for all participants), matching the
--     Phase 0 consensus rule ("host proposes, anyone reacts, host confirms").

CREATE TABLE IF NOT EXISTS public.pending_plan_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_plan_id UUID NOT NULL REFERENCES public.pending_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,                 -- 'A' | 'B'
  reaction TEXT NOT NULL CHECK (reaction IN ('up', 'maybe', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pending_plan_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_plan_reactions_plan
  ON public.pending_plan_reactions (pending_plan_id);

ALTER TABLE public.pending_plan_reactions ENABLE ROW LEVEL SECURITY;

-- Visible to anyone on the plan (creator or participant).
DROP POLICY IF EXISTS pending_plan_reactions_select ON public.pending_plan_reactions;
CREATE POLICY pending_plan_reactions_select ON public.pending_plan_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.pending_plans p
    WHERE p.id = pending_plan_reactions.pending_plan_id
      AND (auth.uid() = p.created_by OR auth.uid() = ANY(p.participant_ids))
  )
);

-- Members can write only their own reactions, only while the plan is open.
DROP POLICY IF EXISTS pending_plan_reactions_insert ON public.pending_plan_reactions;
CREATE POLICY pending_plan_reactions_insert ON public.pending_plan_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.pending_plans p
    WHERE p.id = pending_plan_reactions.pending_plan_id
      AND (auth.uid() = p.created_by OR auth.uid() = ANY(p.participant_ids))
      AND p.status IN ('pending', 'pivot_pending')
  )
);

DROP POLICY IF EXISTS pending_plan_reactions_update ON public.pending_plan_reactions;
CREATE POLICY pending_plan_reactions_update ON public.pending_plan_reactions FOR UPDATE USING (
  auth.uid() = user_id
) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pending_plan_reactions_delete ON public.pending_plan_reactions;
CREATE POLICY pending_plan_reactions_delete ON public.pending_plan_reactions FOR DELETE USING (
  auth.uid() = user_id
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_plan_reactions TO authenticated;

-- Realtime: live reaction counts on the CTA card.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_plan_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

-- Host finalize: the plan creator records confirmations for ALL participants in
-- one call, so the existing pending-plan-confirm finalize path runs. Used for
-- group plans where the host "locks it in" instead of waiting for everyone.
CREATE OR REPLACE FUNCTION public.confirm_pending_plan_host(p_plan_id UUID)
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
  uid UUID;
  cc INT;
  pc INT;
BEGIN
  SELECT * INTO p_row FROM public.pending_plans WHERE id = pid;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Host only.
  IF auth.uid() <> p_row.created_by THEN
    RETURN;
  END IF;
  IF p_row.status NOT IN ('pending', 'pivot_pending') THEN
    RETURN;
  END IF;

  FOREACH uid IN ARRAY p_row.participant_ids LOOP
    INSERT INTO public.pending_plan_confirmations (pending_plan_id, user_id)
    VALUES (pid, uid)
    ON CONFLICT (pending_plan_id, user_id) DO NOTHING;
  END LOOP;

  SELECT COUNT(*)::int INTO cc FROM public.pending_plan_confirmations WHERE pending_plan_id = pid;
  SELECT COALESCE(array_length(p_row.participant_ids, 1), 0)::int INTO pc;

  pending_plan_id := pid;
  confirmed_count := cc;
  participant_count := pc;
  all_participants_confirmed := (pc > 0 AND cc >= pc);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pending_plan_host(UUID) TO authenticated;
