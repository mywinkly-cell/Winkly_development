-- Romance discover feed: only show users who have Romance mode enabled (have a romance sub-profile).
-- Fixes Romance discovery showing Friends-only or other mode users.
-- Ensures romance_likes exists so this migration can run even if 20250218100000 was not applied.

CREATE TABLE IF NOT EXISTS public.romance_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (liker_id, liked_id),
  CHECK (liker_id != liked_id)
);

ALTER TABLE public.romance_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rl_select ON public.romance_likes;
DROP POLICY IF EXISTS rl_insert ON public.romance_likes;
DROP POLICY IF EXISTS rl_delete ON public.romance_likes;
CREATE POLICY rl_select ON public.romance_likes FOR SELECT USING (
  auth.uid() = liker_id OR auth.uid() = liked_id
);
CREATE POLICY rl_insert ON public.romance_likes FOR INSERT WITH CHECK (auth.uid() = liker_id);
CREATE POLICY rl_delete ON public.romance_likes FOR DELETE USING (auth.uid() = liker_id);

ALTER TABLE public.romance_likes
  ADD COLUMN IF NOT EXISTS super_like BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS super_like_message TEXT;

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
