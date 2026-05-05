-- Align sub_profiles with app writes (Option B: app uses Supabase tables)
-- Ensures sub_profiles has columns: user_id, mode, bio, photos, interests, meta
-- Unique constraint: (user_id, mode) for upsert

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
