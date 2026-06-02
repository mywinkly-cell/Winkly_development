-- Mode-safe single business profile read (matches, discover, chat profile-view).
-- SECURITY DEFINER bypasses profiles_business owner-only RLS; blocks are enforced.

CREATE OR REPLACE FUNCTION public.business_profile_for_viewer(
  current_user_id UUID,
  target_user_id UUID
)
RETURNS SETOF public.profiles_business
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business_profile_for_viewer: forbidden'
      USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = target_user_id)
       OR (ub.blocker_id = target_user_id AND ub.blocked_id = current_user_id)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT pb.*
    FROM public.profiles_business pb
    WHERE pb.id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_profile_for_viewer(UUID, UUID) TO authenticated;
