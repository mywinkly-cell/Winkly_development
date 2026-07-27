-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly — repair public.users schema drift
-- v1.0 — 25 July 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- The dev database was missing `users.premium_until`, even though the base schema
-- (20250130000001_winkly_schema.sql:30) defines it.
--
-- Cause: the base schema creates every table with CREATE TABLE IF NOT EXISTS, and
-- that file has been edited after it was first applied. Supabase tracks migrations
-- by version, so an edited file never re-runs; IF NOT EXISTS then leaves the existing
-- table untouched, silently omitting any column added to the file later.
--
-- Impact: ai-gateway/index.ts:395 reads
--     .select("subscription_tier, premium_until, trial_ends_at")
-- A single missing column fails the whole query. getSubscriptionTier() destructures
-- only `data` and ignores the error, so `data` is undefined and effectiveTierFromRow()
-- returns "free". Every user on the affected environment was permanently Free —
-- including the 3-day Premium trial, which never worked there at all.
--
-- Nothing crashed, so this went unnoticed. Contrast 20260630120000_weekly_spark_core.sql:183,
-- which already patches users.status for exactly the same reason.
--
-- This migration is idempotent and safe on every environment, including ones that
-- were already repaired by hand.
--
-- To check for the same drift elsewhere, run supabase/scripts/check-schema-drift.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- From the base schema (20250130000001_winkly_schema.sql).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_premium    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status        TEXT    NOT NULL DEFAULT 'active';

-- From 20250216000001_subscription_tier.sql.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';

-- From 20260628130000_premium_trial.sql.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ;

-- From 20260616120000_business_connections_v1.sql.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_sending_suspended_until TIMESTAMPTZ;

-- The tier CHECK constraint ships with the subscription_tier migration. If that
-- migration was skipped on a drifted environment the column exists without it,
-- so add it here when absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname  = 'users_subscription_tier_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'super', 'premium', 'enterprise'));
  END IF;
END $$;

COMMENT ON COLUMN public.users.premium_until IS
  'End of a paid subscription. NULL with a paid subscription_tier means active with no recorded expiry (see effectiveTierFromRow in ai-gateway).';
