-- Add night_owl to shared personal profile surfaces (core + user_profiles + views)
--
-- NOTE: renamed from 20260426120000 to 20260426121000 to remove a duplicate
-- migration version (confirmed_events_and_chat_link also used 20260426120000),
-- which breaks `supabase db push`.
--
-- The friend_profiles / public_profile_view definitions below APPEND night_owl
-- to the existing column list. They must NOT drop columns that an earlier
-- migration (20250305110000_friend_profiles_occupation_age) added, because
-- CREATE OR REPLACE VIEW cannot remove or reorder columns ("cannot drop columns
-- from view") and dropping occupation/age would break match cards.

-- Core table (used by profile edit-core screen)
ALTER TABLE public.profiles_core
  ADD COLUMN IF NOT EXISTS night_owl BOOLEAN;

-- App-facing personal profiles table (used by onboarding + feeds/views)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS night_owl BOOLEAN;

-- Friends view should expose it (if view exists). Keeps occupation/age/photos/meta.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'friend_profiles' AND c.relkind = 'v'
  ) THEN
    CREATE OR REPLACE VIEW public.friend_profiles AS
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
      pm.updated_at,
      p.night_owl
    FROM public.profiles_mode pm
    JOIN public.user_profiles p ON p.id = pm.user_id
    WHERE pm.mode = 'friends';
    ALTER VIEW public.friend_profiles SET (security_invoker = on);
  END IF;
END $$;

-- Romance view should expose it (if view exists). Appends night_owl at the end.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'public_profile_view' AND c.relkind = 'v'
  ) THEN
    CREATE OR REPLACE VIEW public.public_profile_view AS
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.gender,
      p.birthday,
      EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int AS age,
      p.city,
      p.education,
      p.languages,
      p.occupation,
      p.interests,
      p.core_photos,
      p.main_photo_url,
      p.instagram,
      p.created_at,
      p.updated_at,
      pm.bio AS bio_romance,
      pm.photos AS romance_photos,
      pm.interests AS romance_interests,
      pm.meta AS romance_meta,
      p.night_owl
    FROM public.user_profiles p
    LEFT JOIN public.profiles_mode pm ON pm.user_id = p.id AND pm.mode = 'romance';
  END IF;
END $$;
