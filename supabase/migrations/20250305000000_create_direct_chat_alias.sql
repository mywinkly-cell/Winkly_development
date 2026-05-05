-- Alias for common typo: create_derect_chat -> create_direct_chat
-- So "Couldn't find the function public.create_derect_chat in the schema cache" is resolved.
CREATE OR REPLACE FUNCTION public.create_derect_chat(
  p_user_a UUID,
  p_user_b UUID,
  p_mode app_mode,
  p_source dm_source,
  p_initiator UUID
)
RETURNS UUID AS $$
BEGIN
  RETURN public.create_direct_chat(p_user_a, p_user_b, p_mode, p_source, p_initiator);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_derect_chat(UUID, UUID, app_mode, dm_source, UUID) TO authenticated;

COMMENT ON FUNCTION public.create_derect_chat(UUID, UUID, app_mode, dm_source, UUID) IS
  'Alias for create_direct_chat (typo). Prefer create_direct_chat.';

