-- ────────────────────────────────────────────────
-- Winkly Database Schema: user_profiles
-- v7.1 – January 2026
-- © Winkly Technologies UG (haftungsbeschränkt)
-- Maintainer: Kateryna Shyshkalova
-- Purpose: Core profile information for personal users
-- Updates: Added instagram for personal profile linking
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT,
  birthday DATE,
  city TEXT,
  education TEXT,
  occupation TEXT,

  -- Social
  instagram TEXT,

  -- Languages & Interests
  languages TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',

  -- Lifestyle
  smoking TEXT,
  drinking TEXT,
  pets TEXT,
  kids TEXT,
  religion TEXT,
  fitness TEXT,
  food TEXT,
  allergies TEXT,

  -- Media
  core_photos TEXT[] DEFAULT '{}',     -- stored public URLs
  core_videos TEXT[] DEFAULT '{}',     -- optional
  main_photo_url TEXT,                 -- main visible photo for user cards

  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add instagram if table already existed without it (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS instagram TEXT;

-- ────────────────────────────────────────────────
-- Trigger: update timestamp
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_user_profiles_updated_at ON public.user_profiles;

CREATE TRIGGER trg_update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_user_profiles_updated_at();

-- ────────────────────────────────────────────────
-- Security Policies
-- ────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running (avoids duplicates)
DROP POLICY IF EXISTS "Profiles are viewable by all" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.user_profiles;

CREATE POLICY "Profiles are viewable by all"
  ON public.user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.user_profiles FOR DELETE
  USING (auth.uid() = id);
