-- Add occupation and age to friend_profiles view for consistent match card display (name, age, city, job, tags).
-- user_profiles has occupation and birthday; age derived same as public_profile_view.

DROP VIEW IF EXISTS public.friend_profiles;
CREATE VIEW public.friend_profiles AS
SELECT
  pm.id,
  pm.user_id,
  p.first_name,
  p.last_name,
  COALESCE(TRIM(p.first_name || ' ' || p.last_name), 'Friend') AS display_name,
  p.city,
  p.occupation,
  EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int AS age,
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
