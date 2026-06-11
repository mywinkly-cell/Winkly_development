-- General-profile interests are now collected once (shared across Romance &
-- Friends) instead of per sub-profile. The app-facing user_profiles table
-- already has an `interests` column; mirror it on the canonical profiles_core
-- table so the access layer + AI/concierge context stay in sync.
--
-- Additive + idempotent.

ALTER TABLE public.profiles_core
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';

-- Safety: ensure the app-facing table has it too (created in earlier schema).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';
