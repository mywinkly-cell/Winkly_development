-- Winkly Agentic Planning Workflow — confirmed events + chat linkage
-- April 2026

-- 1) Link pending plans to a conversation for strict isolation + notifications
ALTER TABLE public.pending_plans
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pending_plans_conversation_id ON public.pending_plans(conversation_id, created_at DESC);

-- 2) Confirmed events: single canonical event_uid across all participant calendars
-- event_uid is the shared identifier (iCal UID-like); provider-specific event IDs live per participant.
CREATE TABLE IF NOT EXISTS public.confirmed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_plan_id UUID REFERENCES public.pending_plans(id) ON DELETE SET NULL,
  planner_item_id UUID REFERENCES public.planner_items(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  event_uid TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  title TEXT NOT NULL,
  location_id TEXT,
  booking_url TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_uid)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_events_created_by ON public.confirmed_events(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_confirmed_events_planner_item_id ON public.confirmed_events(planner_item_id);
CREATE INDEX IF NOT EXISTS idx_confirmed_events_conversation ON public.confirmed_events(conversation_id, created_at DESC);

ALTER TABLE public.confirmed_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS confirmed_events_select ON public.confirmed_events;
CREATE POLICY confirmed_events_select ON public.confirmed_events FOR SELECT USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.planner_participants pp
    WHERE pp.planner_item_id = confirmed_events.planner_item_id
      AND pp.user_id = auth.uid()
  ) OR
  (confirmed_events.conversation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = confirmed_events.conversation_id
      AND cm.user_id = auth.uid()
      AND cm.left_at IS NULL
  ))
);

DROP POLICY IF EXISTS confirmed_events_insert ON public.confirmed_events;
CREATE POLICY confirmed_events_insert ON public.confirmed_events FOR INSERT WITH CHECK (
  auth.uid() = created_by
);

GRANT SELECT, INSERT ON public.confirmed_events TO authenticated;

-- 3) Per-participant external calendar event IDs
CREATE TABLE IF NOT EXISTS public.confirmed_event_participants (
  confirmed_event_id UUID NOT NULL REFERENCES public.confirmed_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google' | 'outlook' | 'nylas' | 'workspace_mcp' | etc
  external_event_id TEXT, -- provider-specific event id (nullable until sync completes)
  calendar_id TEXT,
  synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
  sync_error TEXT,
  PRIMARY KEY (confirmed_event_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_event_participants_user ON public.confirmed_event_participants(user_id, synced_at DESC);

ALTER TABLE public.confirmed_event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS confirmed_event_participants_select ON public.confirmed_event_participants;
CREATE POLICY confirmed_event_participants_select ON public.confirmed_event_participants FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.confirmed_events ce
    WHERE ce.id = confirmed_event_participants.confirmed_event_id
      AND (
        auth.uid() = ce.created_by OR
        EXISTS (
          SELECT 1 FROM public.planner_participants pp
          WHERE pp.planner_item_id = ce.planner_item_id
            AND pp.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS confirmed_event_participants_insert ON public.confirmed_event_participants;
CREATE POLICY confirmed_event_participants_insert ON public.confirmed_event_participants FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

GRANT SELECT, INSERT, UPDATE ON public.confirmed_event_participants TO authenticated;

