-- Security: romance_discover_feed must exclude blocked users and must not allow calling as another user.
-- Fixes:
-- - Blocked users could still appear in discover feed (user_blocks not joined)
-- - SECURITY DEFINER function could be called with another user's UUID to infer their likes

CREATE OR REPLACE FUNCTION public.romance_discover_feed(current_user_id UUID)
RETURNS SETOF public.public_profile_view
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_discover_feed: forbidden'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
    SELECT v.*
    FROM public.public_profile_view v
    INNER JOIN public.profiles_mode pm ON pm.user_id = v.id AND pm.mode = 'romance'
    WHERE v.id IS NOT NULL
      AND v.id != current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.romance_likes rl
        WHERE rl.liker_id = current_user_id AND rl.liked_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = v.id)
           OR (ub.blocker_id = v.id AND ub.blocked_id = current_user_id)
      )
    ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
    LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.romance_discover_feed(UUID) TO authenticated;

