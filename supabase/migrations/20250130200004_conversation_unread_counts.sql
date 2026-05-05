-- Unread counts per conversation for chat list preview
CREATE OR REPLACE FUNCTION public.get_conversation_unread_counts(
  p_conv_ids UUID[],
  p_user_id UUID
)
RETURNS TABLE (conversation_id UUID, unread_count BIGINT) AS $$
  SELECT m.conversation_id, COUNT(*)::BIGINT
  FROM public.messages m
  LEFT JOIN public.conversation_member_settings cms
    ON cms.conversation_id = m.conversation_id AND cms.user_id = p_user_id
  WHERE m.conversation_id = ANY(p_conv_ids)
    AND m.sender_id != p_user_id
    AND (m.deleted_at IS NULL OR m.delete_type != 'for_everyone')
    AND m.created_at > COALESCE(cms.last_read_at, '1970-01-01'::timestamptz)
  GROUP BY m.conversation_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_conversation_unread_counts(UUID[], UUID) TO authenticated;
