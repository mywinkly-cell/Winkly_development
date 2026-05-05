-- Group chat invitations: invitees must Accept or Decline before being added to the group.
-- Prevents auto-adding users to group chats; creator sends invites, invitee chooses.

CREATE TABLE IF NOT EXISTS public.group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS group_invitations_invitee_status
  ON public.group_invitations (invitee_id, status)
  WHERE status = 'pending';

ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

-- Invitee: can see and update their own invitations (Accept/Decline)
CREATE POLICY group_invitations_invitee_select ON public.group_invitations
  FOR SELECT USING (auth.uid() = invitee_id);

CREATE POLICY group_invitations_invitee_update ON public.group_invitations
  FOR UPDATE USING (auth.uid() = invitee_id)
  WITH CHECK (auth.uid() = invitee_id);

-- Inviter: can see invitations they sent and insert new ones (when creating group)
CREATE POLICY group_invitations_inviter_select ON public.group_invitations
  FOR SELECT USING (auth.uid() = inviter_id);

CREATE POLICY group_invitations_inviter_insert ON public.group_invitations
  FOR INSERT WITH CHECK (auth.uid() = inviter_id);

COMMENT ON TABLE public.group_invitations IS 'Group chat invite flow: invitee must Accept or Decline; only then added to group_members.';
