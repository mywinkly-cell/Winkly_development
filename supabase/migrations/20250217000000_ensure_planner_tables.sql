-- Ensure planner_items and planner_participants exist (required by planner_invitations).
-- Run this before 20250217100000_planner_invitations.sql if your DB was created from
-- remaining_tables only and does not have planner_items yet.
-- Idempotent: safe to run even if tables already exist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'planner_source') THEN
    CREATE TYPE public.planner_source AS ENUM ('romance', 'friends', 'business', 'events');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.planner_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_mode public.planner_source NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  related_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planner_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'attendee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planner_item_id, user_id)
);

-- RLS (only if not already enabled by 20250130000002_winkly_rls)
ALTER TABLE public.planner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_items_select ON public.planner_items;
CREATE POLICY planner_items_select ON public.planner_items FOR SELECT USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.planner_participants pp WHERE pp.planner_item_id = planner_items.id AND pp.user_id = auth.uid())
);
DROP POLICY IF EXISTS planner_items_insert ON public.planner_items;
CREATE POLICY planner_items_insert ON public.planner_items FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS planner_items_update ON public.planner_items;
CREATE POLICY planner_items_update ON public.planner_items FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS planner_participants_all ON public.planner_participants;
CREATE POLICY planner_participants_all ON public.planner_participants FOR ALL USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.planner_items pi WHERE pi.id = planner_item_id AND pi.created_by = auth.uid())
);

COMMENT ON TABLE public.planner_items IS 'Planner items (dates, meetups, meetings, events).';
COMMENT ON TABLE public.planner_participants IS 'Participants of a planner item.';
