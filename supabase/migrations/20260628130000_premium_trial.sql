-- ────────────────────────────────────────────────
-- Winkly — Premium trial for new users
-- Every new signup gets 3 days of Premium access (trial_ends_at = signup + 3 days).
-- After the trial they drop to Free (limited AI) unless they hold a paid tier.
--
-- Effective tier (paid → trial → free) is computed in the app (lib/billing/
-- subscriptionTier.ts) and the ai-gateway (server-side AI gating). This migration
-- only stores the trial window and grants it on signup; it does not mutate
-- subscription_tier, so nothing has to "downgrade" the user when the trial ends.
-- ────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.users.trial_ends_at IS
  'End of the new-user Premium trial. While now() < trial_ends_at and no paid tier is active, effective tier = premium.';

-- Grant the 3-day Premium trial at signup. handle_new_user runs on auth.users INSERT
-- (see 20250306100000_auth_trigger_insert_only.sql). ON CONFLICT deliberately does NOT
-- touch the trial columns, so a re-fired trigger never resets an in-progress trial.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, account_type, trial_started_at, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'account_type')::account_type, 'personal'),
    now(),
    now() + interval '3 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = COALESCE(public.users.account_type, EXCLUDED.account_type),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
