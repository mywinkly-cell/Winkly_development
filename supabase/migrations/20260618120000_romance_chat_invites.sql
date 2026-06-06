-- Romance pre-match chat invites: super-like with message opens a pending DM.
-- Recipient accepts (mutual like) or declines (notifies initiator, hides thread for recipient).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS romance_invite_status TEXT
    CHECK (romance_invite_status IS NULL OR romance_invite_status IN ('pending', 'accepted', 'declined'));

COMMENT ON COLUMN public.conversations.romance_invite_status IS
  'Romance dm_source=invite only: pending until recipient accepts; accepted after mutual like; declined when recipient rejects.';

-- Insert opener as first message (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.romance_insert_invite_opener(
  p_conversation_id UUID,
  p_sender UUID,
  p_content TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF trim(coalesce(p_content, '')) = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
  VALUES (p_conversation_id, p_sender, trim(p_content), 'text');
  UPDATE public.conversations
  SET last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.romance_insert_invite_opener(UUID, UUID, TEXT) TO authenticated;

-- Create or reuse pending invite DM + optional opener message.
CREATE OR REPLACE FUNCTION public.romance_ensure_pending_invite_chat(
  p_liker UUID,
  p_liked UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id UUID;
  v_pair_key TEXT;
BEGIN
  IF p_liker = p_liked THEN
    RAISE EXCEPTION 'Cannot invite self';
  END IF;

  v_pair_key := LEAST(p_liker::text, p_liked::text) || ':' || GREATEST(p_liker::text, p_liked::text);

  SELECT c.id INTO v_chat_id
  FROM public.conversations c
  WHERE c.type = 'dm'
    AND c.mode = 'romance'
    AND c.dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    v_chat_id := public.create_direct_chat(p_liker, p_liked, 'romance'::app_mode, 'invite'::dm_source, p_liker);
    UPDATE public.conversations
    SET romance_invite_status = 'pending'
    WHERE id = v_chat_id;
  ELSE
    UPDATE public.conversations
    SET romance_invite_status = COALESCE(romance_invite_status, 'pending'),
        dm_source = CASE WHEN romance_invite_status = 'accepted' THEN dm_source ELSE 'invite'::dm_source END
    WHERE id = v_chat_id
      AND mode = 'romance'
      AND type = 'dm'
      AND (romance_invite_status IS NULL OR romance_invite_status IN ('pending', 'declined'));
  END IF;

  IF trim(coalesce(p_message, '')) <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = v_chat_id AND m.sender_id = p_liker
    ) THEN
      PERFORM public.romance_insert_invite_opener(v_chat_id, p_liker, p_message);
    END IF;
  END IF;

  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.romance_ensure_pending_invite_chat(UUID, UUID, TEXT) TO authenticated;

-- Super-like with message → pending invite chat (non-match only).
CREATE OR REPLACE FUNCTION public.romance_like_profile(
  current_user_id UUID,
  target_user_id UUID,
  p_super_like BOOLEAN DEFAULT false,
  p_super_like_message TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_exists BOOLEAN;
  v_chat_id UUID;
  v_msg TEXT;
BEGIN
  IF current_user_id = target_user_id THEN
    RETURN jsonb_build_object('liked', false, 'is_match', false, 'error', 'Cannot like yourself');
  END IF;

  INSERT INTO public.romance_likes (liker_id, liked_id, super_like, super_like_message)
  VALUES (current_user_id, target_user_id, COALESCE(p_super_like, false), p_super_like_message)
  ON CONFLICT (liker_id, liked_id) DO UPDATE SET
    super_like = COALESCE(EXCLUDED.super_like, romance_likes.super_like),
    super_like_message = COALESCE(EXCLUDED.super_like_message, romance_likes.super_like_message);

  SELECT EXISTS (
    SELECT 1 FROM public.romance_likes a
    JOIN public.romance_likes b ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
    WHERE a.liker_id = current_user_id AND a.liked_id = target_user_id
  ) INTO v_exists;

  IF v_exists THEN
    v_chat_id := public.create_direct_chat(
      current_user_id, target_user_id, 'romance'::app_mode, 'match'::dm_source, current_user_id
    );
    UPDATE public.conversations
    SET romance_invite_status = 'accepted', dm_source = 'match'::dm_source
    WHERE id = v_chat_id;
    RETURN jsonb_build_object('liked', true, 'is_match', true, 'chat_id', v_chat_id);
  END IF;

  v_msg := NULLIF(trim(coalesce(p_super_like_message, '')), '');
  IF v_msg IS NOT NULL THEN
    v_chat_id := public.romance_ensure_pending_invite_chat(current_user_id, target_user_id, v_msg);
    RETURN jsonb_build_object('liked', true, 'is_match', false, 'chat_id', v_chat_id, 'invite_pending', true);
  END IF;

  RETURN jsonb_build_object('liked', true, 'is_match', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.romance_like_profile(current_user_id UUID, target_user_id UUID)
RETURNS JSONB AS $$
  SELECT public.romance_like_profile(current_user_id, target_user_id, false, NULL);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID) TO authenticated;

-- Recipient accepts: mutual like + full match chat.
CREATE OR REPLACE FUNCTION public.accept_romance_chat_invite(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_other UUID;
  v_initiator UUID;
  v_result JSONB;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.dm_initiator INTO v_initiator
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND c.type = 'dm'
    AND c.mode = 'romance'
    AND c.dm_source = 'invite'
    AND c.romance_invite_status = 'pending';

  IF v_initiator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a pending romance invite');
  END IF;

  SELECT cm.user_id INTO v_other
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id AND cm.user_id <> v_me AND cm.left_at IS NULL
  LIMIT 1;

  IF v_other IS NULL OR v_other <> v_initiator THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid invite participants');
  END IF;

  v_result := public.romance_like_profile(v_me, v_other, false, NULL);

  UPDATE public.conversations
  SET romance_invite_status = 'accepted',
      dm_source = 'match'::dm_source,
      updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'is_match', COALESCE((v_result->>'is_match')::boolean, false),
    'chat_id', p_conversation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_romance_chat_invite(UUID) TO authenticated;

-- Recipient declines: notify initiator, hide for recipient.
CREATE OR REPLACE FUNCTION public.decline_romance_chat_invite(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_initiator UUID;
  v_decliner_name TEXT;
  v_payload TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.dm_initiator INTO v_initiator
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND c.type = 'dm'
    AND c.mode = 'romance'
    AND c.dm_source = 'invite'
    AND c.romance_invite_status = 'pending';

  IF v_initiator IS NULL OR v_initiator = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a pending romance invite');
  END IF;

  SELECT trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
  INTO v_decliner_name
  FROM public.user_profiles p
  WHERE p.id = v_me;

  IF v_decliner_name IS NULL OR v_decliner_name = '' THEN
    v_decliner_name := 'They';
  END IF;

  v_payload := jsonb_build_object(
    'type', 'romance_invite_declined',
    'decliner_name', v_decliner_name,
    'body', format('Unfortunately, %s declined your chat invite.', v_decliner_name)
  )::text;

  INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
  VALUES (p_conversation_id, v_me, v_payload, 'cta');

  UPDATE public.conversations
  SET romance_invite_status = 'declined', updated_at = now(), last_message_at = now()
  WHERE id = p_conversation_id;

  UPDATE public.conversation_members
  SET left_at = now()
  WHERE conversation_id = p_conversation_id AND user_id = v_me;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_romance_chat_invite(UUID) TO authenticated;

-- Pending invites for Home deck + Chats (recipient view).
CREATE OR REPLACE FUNCTION public.romance_pending_chat_invites(p_user_id UUID)
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'conversation_id', c.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city,
    'occupation', p.occupation,
    'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos,
    'preview_message', (
      SELECT m.content
      FROM public.messages m
      WHERE m.conversation_id = c.id AND m.sender_id = c.dm_initiator
      ORDER BY m.created_at ASC
      LIMIT 1
    ),
    'super_like', COALESCE(rl.super_like, false)
  )
  FROM public.conversations c
  JOIN auth.users u ON u.id = c.dm_initiator
  JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = p_user_id AND cm.left_at IS NULL
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance'
  LEFT JOIN public.romance_likes rl ON rl.liker_id = c.dm_initiator AND rl.liked_id = p_user_id
  WHERE c.type = 'dm'
    AND c.mode = 'romance'
    AND c.dm_source = 'invite'
    AND c.romance_invite_status = 'pending'
    AND c.dm_initiator <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.romance_likes x
      WHERE x.liker_id = p_user_id AND x.liked_id = c.dm_initiator
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.romance_pending_chat_invites(UUID) TO authenticated;

-- Messaging rules for pending romance invites.
CREATE OR REPLACE FUNCTION public.is_dm_send_allowed(p_conversation_id UUID, p_sender UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   conversation_type;
  v_mode   app_mode;
  v_source dm_source;
  v_initiator UUID;
  v_invite_status TEXT;
  v_other  UUID;
  v_match  BOOLEAN;
BEGIN
  SELECT c.type, c.mode, c.dm_source, c.dm_initiator, c.romance_invite_status
    INTO v_type, v_mode, v_source, v_initiator, v_invite_status
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_type IS NULL THEN
    RETURN false;
  END IF;

  IF v_type <> 'dm' THEN
    RETURN true;
  END IF;

  SELECT cm.user_id INTO v_other
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id
    AND cm.user_id <> p_sender
    AND cm.left_at IS NULL
  LIMIT 1;

  IF v_other IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = p_sender AND b.blocked_id = v_other)
       OR (b.blocker_id = v_other AND b.blocked_id = p_sender)
  ) THEN
    RETURN false;
  END IF;

  IF v_mode = 'romance' AND v_source = 'invite' AND v_invite_status = 'pending' THEN
    -- Only the opener was inserted server-side; no further messages until accept.
    RETURN false;
  END IF;

  IF v_source = 'match' AND v_mode = 'romance' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.romance_likes a
      JOIN public.romance_likes b
        ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
      WHERE a.liker_id = p_sender AND a.liked_id = v_other
    ) INTO v_match;
    RETURN v_match;
  END IF;

  RETURN true;
END;
$$;
