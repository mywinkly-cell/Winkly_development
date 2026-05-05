-- Draft plans + double opt-in for the Match Agent (concierge "brain") — privacy wall.

DO $$ BEGIN
  CREATE TYPE ai_match_proposal_status AS ENUM (
    'draft',
    'awaiting_primary',
    'awaiting_partner',
    'confirmed',
    'declined',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_match_agent_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode app_mode NOT NULL DEFAULT 'romance',
  status ai_match_proposal_status NOT NULL DEFAULT 'draft',
  /** Full agent output: chain steps, venue, messages, rules */
  plan_json JSONB NOT NULL DEFAULT '{}',
  agent_message TEXT,
  extract_summary TEXT,
  search_context JSONB,
  weather_note TEXT,
  primary_approved_at TIMESTAMPTZ,
  partner_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (created_by <> partner_user_id)
);

CREATE INDEX IF NOT EXISTS ai_match_agent_proposals_conv ON public.ai_match_agent_proposals (conversation_id);
CREATE INDEX IF NOT EXISTS ai_match_agent_proposals_users ON public.ai_match_agent_proposals (created_by, partner_user_id);

ALTER TABLE public.ai_match_agent_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_match_proposals_participants ON public.ai_match_agent_proposals;
DROP POLICY IF EXISTS ai_match_proposals_insert ON public.ai_match_agent_proposals;
DROP POLICY IF EXISTS ai_match_proposals_select ON public.ai_match_agent_proposals;
DROP POLICY IF EXISTS ai_match_proposals_update ON public.ai_match_agent_proposals;

CREATE POLICY ai_match_proposals_insert ON public.ai_match_agent_proposals
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY ai_match_proposals_select ON public.ai_match_agent_proposals
  FOR SELECT USING (auth.uid() = created_by OR auth.uid() = partner_user_id);

CREATE POLICY ai_match_proposals_update ON public.ai_match_agent_proposals
  FOR UPDATE USING (auth.uid() = created_by OR auth.uid() = partner_user_id);

COMMENT ON TABLE public.ai_match_agent_proposals IS
  'Match Agent draft plans; double opt-in via primary_approved_at / partner_approved_at. No street-level home addresses in plan_json.';
