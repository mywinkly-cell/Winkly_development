-- Run this in Supabase SQL Editor if you get "relation planner_items does not exist"
-- when applying the planner_invitations migration. It creates planner_items, planner_participants,
-- and planner_invitations in one go. Idempotent: safe to run more than once.

-- 1) Enum (skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'planner_source') THEN
    CREATE TYPE public.planner_source AS ENUM ('romance', 'friends', 'business', 'events');
  END IF;
END
$$;

-- 2) planner_items (skip if exists)
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

-- 3) planner_participants (skip if exists)
CREATE TABLE IF NOT EXISTS public.planner_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'attendee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planner_item_id, user_id)
);

-- 4) RLS for planner_items / planner_participants
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

-- 5) planner_invitations
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
