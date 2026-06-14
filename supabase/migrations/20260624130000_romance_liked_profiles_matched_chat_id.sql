-- Replace dead liked_you_back (mutual like + no DM can never occur — DM is created
-- synchronously by trg_mutual_romance_like_create_dm) with matched_chat_id for Sent likes UI.

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
    'super_like_message', rl.super_like_message,
    'matched_chat_id', (
      SELECT c.id
      FROM public.conversations c
      INNER JOIN public.conversation_members cm_me
        ON cm_me.conversation_id = c.id
       AND cm_me.user_id = current_user_id
       AND cm_me.left_at IS NULL
      INNER JOIN public.conversation_members cm_them
        ON cm_them.conversation_id = c.id
       AND cm_them.user_id = rl.liked_id
       AND cm_them.left_at IS NULL
      WHERE c.type = 'dm'
        AND c.mode = 'romance'
      LIMIT 1
    )
  )
  FROM public.romance_likes rl
  JOIN auth.users u ON u.id = rl.liked_id
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = u.id AND pm.mode = 'romance'
  WHERE rl.liker_id = current_user_id
  ORDER BY rl.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
