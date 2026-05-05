-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly 1:1 Direct Chat — Creation Triggers
-- v1.0 – February 2026
-- Purpose: Auto-create direct chats on match/connection/invite per spec
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ROMANCE_LIKES — mutual like (match) creates DM
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.romance_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (liker_id, liked_id),
  CHECK (liker_id != liked_id)
);

ALTER TABLE public.romance_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY rl_select ON public.romance_likes FOR SELECT USING (
  auth.uid() = liker_id OR auth.uid() = liked_id
);
CREATE POLICY rl_insert ON public.romance_likes FOR INSERT WITH CHECK (auth.uid() = liker_id);
CREATE POLICY rl_delete ON public.romance_likes FOR DELETE USING (auth.uid() = liker_id);

-- RPC: romance_like_profile — like someone, returns { liked: true, is_match: bool, chat_id?: uuid }
CREATE OR REPLACE FUNCTION public.romance_like_profile(
  current_user_id UUID,
  target_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_exists BOOLEAN;
  v_chat_id UUID;
BEGIN
  IF current_user_id = target_user_id THEN
    RETURN jsonb_build_object('liked', false, 'is_match', false, 'error', 'Cannot like yourself');
  END IF;

  -- Insert like (idempotent)
  INSERT INTO public.romance_likes (liker_id, liked_id)
  VALUES (current_user_id, target_user_id)
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  -- Check mutual like (match)
  SELECT EXISTS (
    SELECT 1 FROM public.romance_likes a
    JOIN public.romance_likes b ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
    WHERE a.liker_id = current_user_id AND a.liked_id = target_user_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Create or get DM (match source)
    v_chat_id := public.create_direct_chat(
      current_user_id, target_user_id, 'romance'::app_mode, 'match'::dm_source, current_user_id
    );
    RETURN jsonb_build_object('liked', true, 'is_match', true, 'chat_id', v_chat_id);
  END IF;

  RETURN jsonb_build_object('liked', true, 'is_match', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID) TO authenticated;

-- Views/RPCs for matches screen (if not already defined)
CREATE OR REPLACE FUNCTION public.romance_new_matches(current_user_id UUID)
RETURNS SETOF jsonb AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city,
    'interests', COALESCE(pm.interests, p.interests, '{}'),
    'languages', COALESCE(p.languages, '{}'),
    'occupation', p.occupation,
    'bio_romance', pm.bio,
    'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos
  )
  FROM (
    SELECT a.liked_id AS id FROM public.romance_likes a
    JOIN public.romance_likes b ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
    WHERE a.liker_id = current_user_id
    ORDER BY a.created_at DESC
  ) m
  JOIN auth.users u ON u.id = m.id
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.romance_connections(current_user_id UUID)
RETURNS SETOF jsonb AS $$
  -- Same as new matches for now (DMs = connections)
  SELECT * FROM public.romance_new_matches(current_user_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.romance_likes_received(current_user_id UUID)
RETURNS SETOF jsonb AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city,
    'interests', COALESCE(pm.interests, p.interests, '{}'),
    'languages', COALESCE(p.languages, '{}'),
    'occupation', p.occupation,
    'bio_romance', pm.bio,
    'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos
  )
  FROM public.romance_likes rl
  JOIN auth.users u ON u.id = rl.liker_id
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance'
  WHERE rl.liked_id = current_user_id
  AND NOT EXISTS (SELECT 1 FROM public.romance_likes x WHERE x.liker_id = current_user_id AND x.liked_id = rl.liker_id)
  ORDER BY rl.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.romance_liked_profiles(current_user_id UUID)
RETURNS SETOF jsonb AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city,
    'interests', COALESCE(pm.interests, p.interests, '{}'),
    'languages', COALESCE(p.languages, '{}'),
    'occupation', p.occupation,
    'bio_romance', pm.bio,
    'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos
  )
  FROM public.romance_likes rl
  JOIN auth.users u ON u.id = rl.liked_id
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance'
  WHERE rl.liker_id = current_user_id
  ORDER BY rl.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.romance_new_matches(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.romance_connections(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.romance_likes_received(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.romance_liked_profiles(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FRIENDS/BUSINESS — mutual follow creates DM (connection)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_mutual_follow_create_dm()
RETURNS TRIGGER AS $$
DECLARE
  v_other UUID;
  v_mode app_mode;
  v_chat_id UUID;
BEGIN
  -- NEW = (follower_id, followee_id). Check if reverse exists.
  IF EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = NEW.followee_id AND followee_id = NEW.follower_id
  ) THEN
    -- Mutual follow: create DM. Use friends mode by default (could add mode column later)
    v_other := NEW.followee_id;
    v_mode := 'friends'; -- or detect from context; for now friends
    v_chat_id := public.create_direct_chat(
      NEW.follower_id, v_other, v_mode, 'connection'::dm_source, NEW.follower_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mutual_follow_create_dm ON public.follows;
CREATE TRIGGER trg_mutual_follow_create_dm
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.on_mutual_follow_create_dm();
