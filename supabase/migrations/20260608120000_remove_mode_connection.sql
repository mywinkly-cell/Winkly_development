-- Remove match/connection: bilateral cleanup + close DM for both members (not a block).

CREATE OR REPLACE FUNCTION public.remove_mode_connection(
  p_other_user_id UUID,
  p_mode app_mode
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_chat_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'remove_mode_connection: not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_other_user_id IS NULL OR p_other_user_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_user');
  END IF;

  IF p_mode = 'romance' THEN
    DELETE FROM public.romance_likes
    WHERE (liker_id = v_uid AND liked_id = p_other_user_id)
       OR (liker_id = p_other_user_id AND liked_id = v_uid);
  ELSIF p_mode = 'friends' THEN
    DELETE FROM public.follows
    WHERE (follower_id = v_uid AND followee_id = p_other_user_id)
       OR (follower_id = p_other_user_id AND followee_id = v_uid);
  ELSIF p_mode = 'business' THEN
    UPDATE public.business_connections
    SET status = 'withdrawn', withdrawn_at = now()
    WHERE status = 'accepted'
      AND (
        (from_user_id = v_uid AND to_user_id = p_other_user_id)
        OR (from_user_id = p_other_user_id AND to_user_id = v_uid)
      );
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'unsupported_mode');
  END IF;

  SELECT c.id INTO v_chat_id
  FROM public.conversations c
  JOIN public.conversation_members cm1
    ON cm1.conversation_id = c.id AND cm1.user_id = v_uid
  JOIN public.conversation_members cm2
    ON cm2.conversation_id = c.id AND cm2.user_id = p_other_user_id
  WHERE c.type = 'dm' AND c.mode = p_mode
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    UPDATE public.conversation_members
    SET left_at = now()
    WHERE conversation_id = v_chat_id
      AND user_id IN (v_uid, p_other_user_id)
      AND left_at IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'chat_id', v_chat_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_mode_connection(UUID, app_mode) TO authenticated;
