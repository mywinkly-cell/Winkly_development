-- ────────────────────────────────────────────────
-- Winkly — Onboarding profile fields
-- Adds: short bio, "looking for" gender preference, and activity
-- preferences (tags that drive the activity recommendation engine).
-- Additive + idempotent. Applied to both the app-facing user_profiles
-- table (onboarding + feeds/views) and the canonical profiles_core table.
-- ────────────────────────────────────────────────

-- App-facing personal profiles table (used by onboarding + feeds/views)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS looking_for TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activity_preferences TEXT[] DEFAULT '{}';

-- Canonical core table (used by profile edit-core screen + access layer)
ALTER TABLE public.profiles_core
  ADD COLUMN IF NOT EXISTS looking_for TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activity_preferences TEXT[] DEFAULT '{}';
-- profiles_core.bio already exists (see 20250130000001_winkly_schema.sql)
