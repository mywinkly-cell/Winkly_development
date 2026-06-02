-- Align sub_profiles with app writes (Option B: app uses Supabase tables)
-- Ensures sub_profiles has columns: user_id, mode, bio, photos, interests, meta
-- Unique constraint: (user_id, mode) for upsert
--
-- Create table first so `supabase db reset` succeeds (table is redefined in
-- 20250216110000_remaining_tables_and_views.sql for environments that skipped this).

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

-- Add columns if missing (idempotent)
ALTER TABLE public.sub_profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sub_profiles ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE public.sub_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.sub_profiles ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';
ALTER TABLE public.sub_profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';
ALTER TABLE public.sub_profiles ADD COLUMN IF NOT EXISTS meta JSONB;

-- Create unique constraint if not exists (enables upsert on user_id,mode)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sub_profiles_user_id_mode_key'
  ) THEN
    ALTER TABLE public.sub_profiles
      ADD CONSTRAINT sub_profiles_user_id_mode_key UNIQUE (user_id, mode);
  END IF;
END $$;
