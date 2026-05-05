-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly: remaining tables and views required by the app
-- Run in Supabase SQL Editor (full script). Creates: sub_profiles, events_planner_items,
-- companies, business_services, notifications; views: business_profiles, friend_profiles,
-- public_profile_view. Then RLS + policies for all.
--
-- Prerequisites: table events must exist (for events_planner_items).
-- If user_profiles, profiles_business, profiles_mode are missing, they are created below.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. USER_PROFILES (create if missing; required for friend_profiles, public_profile_view)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  gender TEXT,
  birthday DATE,
  city TEXT,
  education TEXT,
  occupation TEXT,
  instagram TEXT,
  languages TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  core_photos TEXT[] DEFAULT '{}',
  main_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by all" ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_authenticated ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert_own ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_delete_own ON public.user_profiles;
CREATE POLICY user_profiles_select_own ON public.user_profiles FOR SELECT USING (auth.uid() = id);
-- Allow authenticated users to read other profiles (chats, discover, new-chat)
CREATE POLICY user_profiles_select_authenticated ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY user_profiles_insert_own ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY user_profiles_update_own ON public.user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY user_profiles_delete_own ON public.user_profiles FOR DELETE USING (auth.uid() = id);

-- Columns the app expects (add if missing)
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0b. PROFILES_MODE (create if missing; required for friend_profiles, public_profile_view)
--    Use TEXT for mode to avoid requiring app_mode enum.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles_mode (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  bio TEXT,
  photos TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

ALTER TABLE public.profiles_mode ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_mode_all ON public.profiles_mode;
CREATE POLICY profiles_mode_all ON public.profiles_mode FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SUB_PROFILES (app uses for mode-specific profile; repo only had ALTER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sub_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  bio TEXT,
  photos TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

ALTER TABLE public.sub_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_profiles_all ON public.sub_profiles;
CREATE POLICY sub_profiles_all ON public.sub_profiles FOR ALL
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. EVENTS (create if missing; required for events_planner_items FK)
--    Column names match app: start_at, end_at, cover_url, venue_name, category, etc.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  city TEXT,
  location TEXT,
  venue_name TEXT,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ,
  cover_url TEXT,
  cover_image_uri TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  capacity INT,
  price_eur NUMERIC(10,2),
  visibility TEXT NOT NULL DEFAULT 'public',
  mode TEXT NOT NULL DEFAULT 'events',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add app-expected columns if table already existed with different schema
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS capacity INT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS price_eur NUMERIC(10,2);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT USING (true);
DROP POLICY IF EXISTS events_insert ON public.events;
CREATE POLICY events_insert ON public.events FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_update ON public.events FOR UPDATE USING (auth.uid() = created_by);

-- event_participants (for RSVP and event details)
CREATE TABLE IF NOT EXISTS public.event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'attendee',
  rsvp_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_participants_all ON public.event_participants;
CREATE POLICY event_participants_all ON public.event_participants FOR ALL USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.created_by = auth.uid())
);

-- event_chat_settings (for "Allow group chat" on create event)
CREATE TABLE IF NOT EXISTS public.event_chat_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  chat_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);
ALTER TABLE public.event_chat_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_chat_settings_all ON public.event_chat_settings;
CREATE POLICY event_chat_settings_all ON public.event_chat_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.created_by = auth.uid())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EVENTS_PLANNER_ITEMS (app upserts user_id + event_id for "Save to planner")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events_planner_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE public.events_planner_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_planner_items_select ON public.events_planner_items;
CREATE POLICY events_planner_items_select ON public.events_planner_items FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS events_planner_items_insert ON public.events_planner_items;
CREATE POLICY events_planner_items_insert ON public.events_planner_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS events_planner_items_update ON public.events_planner_items;
CREATE POLICY events_planner_items_update ON public.events_planner_items FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS events_planner_items_delete ON public.events_planner_items;
CREATE POLICY events_planner_items_delete ON public.events_planner_items FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. COMPANIES (business discover + companies index)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  industry TEXT,
  size TEXT,
  website TEXT,
  logo_url TEXT,
  tagline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT USING (true);
DROP POLICY IF EXISTS companies_insert ON public.companies;
CREATE POLICY companies_insert ON public.companies FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_update ON public.companies FOR UPDATE USING (true);
-- Restrict to authenticated if you prefer; above allows public read for discover.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. BUSINESS_SERVICES (business discover)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT,
  city TEXT,
  short_description TEXT,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_services_select ON public.business_services;
CREATE POLICY business_services_select ON public.business_services FOR SELECT USING (true);
DROP POLICY IF EXISTS business_services_insert ON public.business_services;
CREATE POLICY business_services_insert ON public.business_services FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS business_services_update ON public.business_services;
CREATE POLICY business_services_update ON public.business_services FOR UPDATE USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. NOTIFICATIONS (shared-ui notifications screen)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5b. PROFILES_BUSINESS (create if missing; required for business_profiles view)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles_business (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL DEFAULT '',
  location TEXT,
  area TEXT,
  bio TEXT,
  tags TEXT[],
  website TEXT,
  instagram TEXT,
  facebook TEXT,
  linkedin TEXT,
  logo_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles_business ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_business_all ON public.profiles_business;
CREATE POLICY profiles_business_all ON public.profiles_business FOR ALL
  USING (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VIEW: business_profiles (app name for profiles_business)
--    Skip if business_profiles already exists as a TABLE (e.g. from Dashboard).
-- ─────────────────────────────────────────────────────────────────────────────
-- Functions first (used by view triggers when view exists)
CREATE OR REPLACE FUNCTION public.business_profiles_instead_of_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles_business (id, business_name, location, area, bio, tags, website, instagram, facebook, linkedin, logo_uri)
  VALUES (
    COALESCE(NEW.id, NEW.user_id),
    COALESCE(NEW.business_name, NEW.display_name, ''),
    NEW.city,
    NEW.area,
    NEW.bio,
    NEW.tags,
    NEW.website,
    NEW.instagram,
    NEW.facebook,
    NEW.linkedin,
    COALESCE(NEW.logo_uri, NEW.main_photo_url, NEW.avatar_url)
  )
  ON CONFLICT (id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    location = EXCLUDED.location,
    area = EXCLUDED.area,
    bio = EXCLUDED.bio,
    tags = EXCLUDED.tags,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    facebook = EXCLUDED.facebook,
    linkedin = EXCLUDED.linkedin,
    logo_uri = EXCLUDED.logo_uri,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.business_profiles_instead_of_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles_business SET
    business_name = COALESCE(NEW.business_name, OLD.business_name),
    location = COALESCE(NEW.city, location),
    area = COALESCE(NEW.area, area),
    bio = COALESCE(NEW.bio, bio),
    tags = COALESCE(NEW.tags, tags),
    website = COALESCE(NEW.website, website),
    instagram = COALESCE(NEW.instagram, instagram),
    facebook = COALESCE(NEW.facebook, facebook),
    linkedin = COALESCE(NEW.linkedin, linkedin),
    logo_uri = COALESCE(NEW.logo_uri, NEW.main_photo_url, NEW.avatar_url, logo_uri),
    updated_at = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_profiles' AND c.relkind = 'r'
  ) THEN
    RETURN;  -- already a table, app uses it directly
  END IF;
  DROP VIEW IF EXISTS public.business_profiles;
  CREATE VIEW public.business_profiles AS
  SELECT
    id,
    id AS user_id,
    business_name,
    business_name AS display_name,
    location AS city,
    business_name AS company_name,
    logo_uri AS main_photo_url,
    logo_uri AS avatar_url,
    area,
    bio,
    tags,
    website,
    instagram,
    facebook,
    linkedin,
    logo_uri,
    created_at,
    updated_at
  FROM public.profiles_business;
  ALTER VIEW public.business_profiles SET (security_invoker = on);
  GRANT SELECT, INSERT, UPDATE ON public.business_profiles TO authenticated;
END $$;

-- INSTEAD OF triggers only when business_profiles is a view
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'business_profiles' AND c.relkind = 'v') THEN
    DROP TRIGGER IF EXISTS business_profiles_instead_of_insert ON public.business_profiles;
    CREATE TRIGGER business_profiles_instead_of_insert
      INSTEAD OF INSERT ON public.business_profiles
      FOR EACH ROW EXECUTE FUNCTION public.business_profiles_instead_of_insert();
    DROP TRIGGER IF EXISTS business_profiles_instead_of_update ON public.business_profiles;
    CREATE TRIGGER business_profiles_instead_of_update
      INSTEAD OF UPDATE ON public.business_profiles
      FOR EACH ROW EXECUTE FUNCTION public.business_profiles_instead_of_update();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VIEW: friend_profiles (Friends mode discover/profile; from user_profiles + profiles_mode)
--    Skip if friend_profiles already exists as a TABLE.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'friend_profiles' AND c.relkind = 'r') THEN
    RETURN;
  END IF;
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
    pm.created_at,
    pm.updated_at
  FROM public.profiles_mode pm
  JOIN public.user_profiles p ON p.id = pm.user_id
  WHERE pm.mode = 'friends';
  ALTER VIEW public.friend_profiles SET (security_invoker = on);
  GRANT SELECT ON public.friend_profiles TO authenticated;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. VIEW: public_profile_view (Romance discover, matches, profile-view; select *)
--    Skip if public_profile_view already exists as a TABLE.
--    CASCADE drops dependent objects (e.g. romance_discover_feed); later migrations recreate them.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'public_profile_view' AND c.relkind = 'r') THEN
    RETURN;
  END IF;
  DROP VIEW IF EXISTS public.public_profile_view CASCADE;
  CREATE VIEW public.public_profile_view AS
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
    pm.meta AS romance_meta
  FROM public.user_profiles p
  LEFT JOIN public.profiles_mode pm ON pm.user_id = p.id AND pm.mode = 'romance';
  ALTER VIEW public.public_profile_view SET (security_invoker = on);
  GRANT SELECT ON public.public_profile_view TO authenticated;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Ensure profiles_business has RLS (required for business_profiles view)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles_business') THEN
    ALTER TABLE public.profiles_business ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS profiles_business_all ON public.profiles_business;
    CREATE POLICY profiles_business_all ON public.profiles_business FOR ALL
      USING (auth.uid() = id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Ensure profiles_mode has RLS (required for friend_profiles view)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles_mode') THEN
    ALTER TABLE public.profiles_mode ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS profiles_mode_all ON public.profiles_mode;
    CREATE POLICY profiles_mode_all ON public.profiles_mode FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Table comments (optional; shows in Dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.sub_profiles IS 'Personal sub-profiles per mode (romance, friends, business); app uses for mode selection and profile edit.';
COMMENT ON TABLE public.events_planner_items IS 'User saves event to planner (Save to planner from event details).';
COMMENT ON TABLE public.companies IS 'Business mode: companies discover and companies index.';
COMMENT ON TABLE public.business_services IS 'Business mode: services discover.';
COMMENT ON TABLE public.notifications IS 'In-app notifications (matches, events, messages).';
