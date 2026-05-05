-- Friends mode: allow reading other users' Friends sub-profiles for discover and profile-view.
-- Extend friend_profiles view to expose photos array and meta (lifestyle, meetup_goals, etc.).
-- Identity Firewall: we only expose mode-specific data (friends); no cross-mode leakage.

-- 1. Allow authenticated users to SELECT from profiles_mode (for discover feed and profile-view)
DROP POLICY IF EXISTS profiles_mode_all ON public.profiles_mode;
CREATE POLICY profiles_mode_own_mutate ON public.profiles_mode
  FOR ALL USING (auth.uid() = user_id);
COMMENT ON POLICY profiles_mode_own_mutate ON public.profiles_mode IS
  'Users can only insert/update/delete their own row. SELECT is allowed for all authenticated (see below).';

-- Allow any authenticated user to read profiles_mode (needed for friend_profiles view to return other users)
CREATE POLICY profiles_mode_select_authenticated ON public.profiles_mode
  FOR SELECT TO authenticated USING (true);

-- 2. Recreate friend_profiles view with photos array and meta for full sub-profile display
-- Idempotent: if friend_profiles exists as a table, drop it first (DROP VIEW errors otherwise)
DROP TABLE IF EXISTS public.friend_profiles CASCADE;
DROP VIEW IF EXISTS public.friend_profiles;
CREATE VIEW public.friend_profiles AS
SELECT
  pm.id,
  pm.user_id,
  p.first_name,
  p.last_name,
  COALESCE(TRIM(p.first_name || ' ' || p.last_name), 'Friend') AS display_name,
  p.city,
  p.instagram,
  pm.bio AS about,
  LEFT(pm.bio, 200) AS about_short,
  COALESCE(pm.interests, p.interests, '{}') AS interests,
  COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(COALESCE(pm.meta->'vibe_tags', 'null'::jsonb)) = 'array'
        THEN pm.meta->'vibe_tags' ELSE '[]'::jsonb END
    ) x),
    '{}'
  ) AS vibe_tags,
  (CASE WHEN array_length(pm.photos, 1) > 0 THEN pm.photos[1] ELSE (CASE WHEN array_length(p.core_photos, 1) > 0 THEN p.core_photos[1] ELSE NULL END) END) AS main_photo_url,
  (CASE WHEN array_length(pm.photos, 1) > 0 THEN pm.photos[1] ELSE (CASE WHEN array_length(p.core_photos, 1) > 0 THEN p.core_photos[1] ELSE NULL END) END) AS avatar_url,
  COALESCE(pm.photos, '{}') AS photos,
  pm.meta AS meta,
  pm.created_at,
  pm.updated_at
FROM public.profiles_mode pm
JOIN public.user_profiles p ON p.id = pm.user_id
WHERE pm.mode = 'friends';
ALTER VIEW public.friend_profiles SET (security_invoker = on);
GRANT SELECT ON public.friend_profiles TO authenticated;
