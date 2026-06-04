-- Link Winkly groups to Supabase conversations (type = group) for Realtime messaging.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS related_group_id UUID;

DO $$ BEGIN
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_related_group_id_fkey
    FOREIGN KEY (related_group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_group_conversation(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group RECORD;
  v_chat_id UUID;
  v_member RECORD;
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, created_by, name, mode INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = p_group_id AND gm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  SELECT c.id INTO v_chat_id
  FROM public.conversations c
  WHERE c.type = 'group' AND c.related_group_id = p_group_id
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO public.conversations (type, mode, created_by, related_group_id, name)
    VALUES ('group', v_group.mode, v_group.created_by, p_group_id, v_group.name)
    RETURNING id INTO v_chat_id;
  ELSE
    UPDATE public.conversations
    SET name = v_group.name
    WHERE id = v_chat_id;
  END IF;

  FOR v_member IN
    SELECT gm.user_id, gm.role
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
  LOOP
    v_role := CASE
      WHEN v_member.role IN ('admin', 'owner') THEN 'admin'
      ELSE 'member'
    END;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_chat_id, v_member.user_id, v_role)
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET
      left_at = NULL,
      role = EXCLUDED.role;
  END LOOP;

  RETURN v_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_group_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_group_conversation(UUID) TO authenticated;

COMMENT ON FUNCTION public.ensure_group_conversation IS
  'Creates or returns the group conversation for a Winkly group; syncs conversation_members from group_members.';
