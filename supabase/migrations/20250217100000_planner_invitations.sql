-- Planner invitations: invite someone to a date/meet-up/meeting (from 1:1 chat).
-- Inviter creates planner_item + planner_invitation; invitee can Accept / Decline / Propose different.
-- See docs/AI_INTEGRATION_AND_DATE_INVITE_RECOMMENDATION.md

CREATE TABLE IF NOT EXISTS public.planner_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'reschedule')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planner_item_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_invitations_invitee_status
  ON public.planner_invitations (invitee_id, status);

ALTER TABLE public.planner_invitations ENABLE ROW LEVEL SECURITY;

-- Inviter and invitee can read; only inviter can insert; invitee can update (accept/decline)
DROP POLICY IF EXISTS planner_invitations_select ON public.planner_invitations;
CREATE POLICY planner_invitations_select ON public.planner_invitations FOR SELECT USING (
  auth.uid() = inviter_id OR auth.uid() = invitee_id
);
DROP POLICY IF EXISTS planner_invitations_insert ON public.planner_invitations;
CREATE POLICY planner_invitations_insert ON public.planner_invitations FOR INSERT WITH CHECK (
  auth.uid() = inviter_id
);
DROP POLICY IF EXISTS planner_invitations_update ON public.planner_invitations;
CREATE POLICY planner_invitations_update ON public.planner_invitations FOR UPDATE USING (
  auth.uid() = inviter_id OR auth.uid() = invitee_id
);
DROP POLICY IF EXISTS planner_invitations_delete ON public.planner_invitations;
CREATE POLICY planner_invitations_delete ON public.planner_invitations FOR DELETE USING (
  auth.uid() = inviter_id
);

COMMENT ON TABLE public.planner_invitations IS 'Invitations to planner items (date/meet-up/meeting); invitee can accept, decline, or propose reschedule.';
