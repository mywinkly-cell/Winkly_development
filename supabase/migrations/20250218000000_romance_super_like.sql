-- ─────────────────────────────────────────────────────────────────────────────
-- Romance: super-like and optional message
-- When a user super-likes someone, the liked user sees this on their card
-- (e.g. in "Likes You" / Pending) and sees the message if one was sent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add columns to romance_likes
ALTER TABLE public.romance_likes
  ADD COLUMN IF NOT EXISTS super_like BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS super_like_message TEXT;

-- 2. romance_like_profile: accept optional super_like and message
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
    RETURN jsonb_build_object('liked', true, 'is_match', true, 'chat_id', v_chat_id);
  END IF;

  RETURN jsonb_build_object('liked', true, 'is_match', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID, BOOLEAN, TEXT) TO authenticated;

-- Backward compatibility: 2-arg version (regular like)
CREATE OR REPLACE FUNCTION public.romance_like_profile(current_user_id UUID, target_user_id UUID)
RETURNS JSONB AS $$
  SELECT public.romance_like_profile(current_user_id, target_user_id, false, NULL);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID) TO authenticated;

-- 3. romance_likes_received: include super_like and super_like_message so the recipient sees them on the card
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
    'core_photos', p.core_photos,
    'super_like', COALESCE(rl.super_like, false),
    'super_like_message', rl.super_like_message
  )
  FROM public.romance_likes rl
  JOIN auth.users u ON u.id = rl.liker_id
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance'
  WHERE rl.liked_id = current_user_id
  AND NOT EXISTS (SELECT 1 FROM public.romance_likes x WHERE x.liker_id = current_user_id AND x.liked_id = rl.liker_id)
  ORDER BY rl.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. romance_liked_profiles: include for consistency (who I liked + whether super like)
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
    'core_photos', p.core_photos,
    'super_like', COALESCE(rl.super_like, false),
    'super_like_message', rl.super_like_message
  )
  FROM public.romance_likes rl
  JOIN auth.users u ON u.id = rl.liked_id
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance'
  WHERE rl.liker_id = current_user_id
  ORDER BY rl.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
