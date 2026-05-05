-- Friends requests: recipient can decline (delete row); accept creates mutual follows + optional DM lookup.
-- Completes the loop for rows in friends_requests (e.g. Super Connect / future connect-only flows).

DROP POLICY IF EXISTS fr_delete_participant ON public.friends_requests;
CREATE POLICY fr_delete_participant ON public.friends_requests FOR DELETE USING (
  auth.uid() = requester_id OR auth.uid() = requested_id
);

CREATE OR REPLACE FUNCTION public.friends_accept_request(p_requester_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID := auth.uid();
  v_chat_id UUID;
BEGIN
  IF rid IS NULL THEN
    RAISE EXCEPTION 'friends_accept_request: not authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_requester_id = rid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friends_requests fr
    WHERE fr.requester_id = p_requester_id AND fr.requested_id = rid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pending_request');
  END IF;

  INSERT INTO public.follows (follower_id, followee_id)
  VALUES (p_requester_id, rid)
  ON CONFLICT (follower_id, followee_id) DO NOTHING;

  INSERT INTO public.follows (follower_id, followee_id)
  VALUES (rid, p_requester_id)
  ON CONFLICT (follower_id, followee_id) DO NOTHING;

  DELETE FROM public.friends_requests
  WHERE requester_id = p_requester_id AND requested_id = rid;

  SELECT c.id INTO v_chat_id
  FROM public.conversations c
  WHERE c.type = 'dm'
    AND c.mode = 'friends'
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m1
      WHERE m1.conversation_id = c.id AND m1.user_id = p_requester_id AND m1.left_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m2
      WHERE m2.conversation_id = c.id AND m2.user_id = rid AND m2.left_at IS NULL
    )
  ORDER BY c.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object('ok', true, 'chat_id', v_chat_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.friends_accept_request(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.friends_decline_request(p_requester_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID := auth.uid();
  deleted INT;
BEGIN
  IF rid IS NULL THEN
    RAISE EXCEPTION 'friends_decline_request: not authenticated'
      USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.friends_requests
  WHERE requester_id = p_requester_id AND requested_id = rid;
  GET DIAGNOSTICS deleted = ROW_COUNT;

  IF deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pending_request');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.friends_decline_request(UUID) TO authenticated;

COMMENT ON TABLE public.friends_requests IS
  'Outgoing friend connect requests. Recipient accepts via friends_accept_request (mutual follow + DM) or declines via friends_decline_request / DELETE.';
