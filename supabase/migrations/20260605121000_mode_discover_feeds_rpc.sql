-- Mode discover feeds (RPC) to avoid direct SELECT * reliance

-- Friends discover feed: returns friend_profiles rows (view) filtered for current user
CREATE OR REPLACE FUNCTION public.friends_discover_feed(current_user_id UUID, p_limit INT DEFAULT 100)
RETURNS SETOF public.friend_profiles
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'friends_discover_feed: forbidden'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
    SELECT fp.*
    FROM public.friend_profiles fp
    WHERE fp.id IS NOT NULL
      AND fp.id != current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = fp.id)
           OR (ub.blocker_id = fp.id AND ub.blocked_id = current_user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_swipes us
        WHERE us.user_id = current_user_id
          AND us.target_user_id = fp.id
          AND us.mode = 'friends'
          AND us.action = 'pass'
      )
    ORDER BY fp.created_at DESC NULLS LAST
    LIMIT greatest(0, least(coalesce(p_limit, 100), 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.friends_discover_feed(UUID, INT) TO authenticated;

-- Business discover feed: exclude self; RLS still applies on underlying table
CREATE OR REPLACE FUNCTION public.business_discover_feed(current_user_id UUID, p_limit INT DEFAULT 100)
RETURNS SETOF public.profiles_business
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business_discover_feed: forbidden'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
    SELECT pb.*
    FROM public.profiles_business pb
    WHERE pb.id != current_user_id
    ORDER BY pb.updated_at DESC NULLS LAST, pb.created_at DESC NULLS LAST
    LIMIT greatest(0, least(coalesce(p_limit, 100), 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_discover_feed(UUID, INT) TO authenticated;

