-- Add Instagram to personal profiles (profiles_core)
ALTER TABLE public.profiles_core
  ADD COLUMN IF NOT EXISTS instagram TEXT;
