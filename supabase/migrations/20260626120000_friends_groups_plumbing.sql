-- Friends-mode groups plumbing:
--   * groups.max_members (soft cap, default 8) + enforcement trigger
--   * group_members co-member visibility (members can see each other) without RLS recursion
--   * group_invitations.invite_code for link-based joins + join_group_by_code RPC
--   * group_plan_vibes (ephemeral mood/energy input for group AI planning)
--   * creator UPDATE policy on groups (edit name/description/max_members)

-- ---------------------------------------------------------------------------
-- 1. Group size cap
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS max_members INT NOT NULL DEFAULT 8;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_max_members_range CHECK (max_members BETWEEN 2 AND 100) NOT VALID;

-- SECURITY DEFINER count helper bypasses RLS so the trigger sees every member.
CREATE OR REPLACE FUNCTION public.group_member_count(p_group_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::int FROM public.group_members WHERE group_id = p_group_id;
$$;

CREATE OR REPLACE FUNCTION public.enforce_group_member_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap INT;
  v_count INT;
BEGIN
  SELECT max_members INTO v_cap FROM public.groups WHERE id = NEW.group_id;
  IF v_cap IS NULL THEN
    v_cap := 8;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.group_members WHERE group_id = NEW.group_id;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'GROUP_FULL: group % is full (% / % members)', NEW.group_id, v_count, v_cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_group_member_cap ON public.group_members;
CREATE TRIGGER trg_enforce_group_member_cap
  BEFORE INSERT ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_member_cap();

-- ---------------------------------------------------------------------------
-- 2. Co-member visibility (members can list each other)
--    The base policy (group_members_all) only lets a member see their OWN row
--    and lets the creator see all rows. To render a real member list we add a
--    permissive SELECT policy gated by a SECURITY DEFINER helper (no recursion).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS group_members_select_comembers ON public.group_members;
CREATE POLICY group_members_select_comembers ON public.group_members
  FOR SELECT USING (public.is_group_member(group_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Creator can edit the group (name/description/max_members/avatar)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS groups_update_creator ON public.groups;
CREATE POLICY groups_update_creator ON public.groups
  FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- 4. Link-based group invites (invite_code)
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Per-group shareable code lives on the group itself so a single link works for anyone.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS groups_invite_code_key
  ON public.groups (invite_code) WHERE invite_code IS NOT NULL;

-- Generate a short, URL-safe code for a group (creator only). Idempotent.
CREATE OR REPLACE FUNCTION public.ensure_group_invite_code(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id AND created_by = v_uid) THEN
    RAISE EXCEPTION 'Only the group owner can create an invite link';
  END IF;

  SELECT invite_code INTO v_code FROM public.groups WHERE id = p_group_id;
  IF v_code IS NOT NULL AND v_code <> '' THEN
    RETURN v_code;
  END IF;

  v_code := lower(replace(encode(gen_random_bytes(6), 'base64'), '/', '_'));
  v_code := regexp_replace(v_code, '[^a-z0-9_]', '', 'g');
  UPDATE public.groups SET invite_code = v_code, updated_at = now() WHERE id = p_group_id;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_group_invite_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_group_invite_code(UUID) TO authenticated;

-- Join a group via its shareable code; enforces the member cap. Returns group id.
CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group_id UUID;
  v_cap INT;
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, max_members INTO v_group_id, v_cap
  FROM public.groups WHERE invite_code = p_code;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'INVITE_INVALID: no group for this code';
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_group_id AND user_id = v_uid) THEN
    RETURN v_group_id; -- already a member, idempotent
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.group_members WHERE group_id = v_group_id;
  IF v_count >= COALESCE(v_cap, 8) THEN
    RAISE EXCEPTION 'GROUP_FULL: this group is full';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role) VALUES (v_group_id, v_uid, 'member');

  -- mark any pending targeted invite as accepted
  UPDATE public.group_invitations
    SET status = 'accepted', updated_at = now()
    WHERE group_id = v_group_id AND invitee_id = v_uid AND status = 'pending';

  RETURN v_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_group_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group_by_code(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Group plan vibes (ephemeral mood/energy input for AI group planning)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_plan_vibes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,           -- 'chill' | 'active' | 'foodie' | 'social' | 'budget' | 'fancy'
  energy SMALLINT,              -- 1-5, optional
  note TEXT,                    -- optional free text ("nothing too far from S-Bahn")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_plan_vibes_conversation_idx
  ON public.group_plan_vibes (conversation_id, expires_at);

ALTER TABLE public.group_plan_vibes ENABLE ROW LEVEL SECURITY;

-- Members of the conversation can read all vibes; users can only write their own row.
DROP POLICY IF EXISTS group_plan_vibes_select ON public.group_plan_vibes;
CREATE POLICY group_plan_vibes_select ON public.group_plan_vibes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = group_plan_vibes.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS group_plan_vibes_insert ON public.group_plan_vibes;
CREATE POLICY group_plan_vibes_insert ON public.group_plan_vibes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = group_plan_vibes.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS group_plan_vibes_update ON public.group_plan_vibes;
CREATE POLICY group_plan_vibes_update ON public.group_plan_vibes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS group_plan_vibes_delete ON public.group_plan_vibes;
CREATE POLICY group_plan_vibes_delete ON public.group_plan_vibes
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.group_plan_vibes IS
  'Ephemeral mood/energy snapshot a group member sets before AI group planning. Expires via expires_at filter (no cron needed for v1).';
