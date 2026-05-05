-- Subscription tier: free | super | premium | enterprise
-- Enables gating AI by tier (Free = no AI, Super = limited AI, Premium = full concierge).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'super', 'premium', 'enterprise'));

-- Backfill: existing is_premium true -> premium
UPDATE public.users
SET subscription_tier = 'premium'
WHERE is_premium = true;

COMMENT ON COLUMN public.users.subscription_tier IS 'free = no AI; super = limited AI (matching, suggestions, planning ideas, chat opener); premium = full AI + concierge; enterprise = future B2B';
