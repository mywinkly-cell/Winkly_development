-- romance_discover_feed: discover feed for Romance (profiles not yet liked by current user).
-- Returns rows compatible with public_profile_view for use in discover swipe.
-- Ensures romance_likes exists so the function does not depend on migration order.

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

-- Add columns from later migrations if missing (e.g. super_like)
ALTER TABLE public.romance_likes
  ADD COLUMN IF NOT EXISTS super_like BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS super_like_message TEXT;

CREATE OR REPLACE FUNCTION public.romance_discover_feed(current_user_id UUID)
RETURNS SETOF public.public_profile_view
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT v.*
  FROM public.public_profile_view v
  WHERE v.id IS NOT NULL
    AND v.id != current_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.romance_likes rl
      WHERE rl.liker_id = current_user_id AND rl.liked_id = v.id
    )
  ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.romance_discover_feed(UUID) TO authenticated;
