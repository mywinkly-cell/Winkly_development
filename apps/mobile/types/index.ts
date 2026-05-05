// Winkly App Types — Source of truth for mode/account/auth
// Aligns with Supabase schema enums and RLS

export type AccountType = "personal" | "business";

export type Mode = "romance" | "friends" | "business" | "events";

export type SubscriptionTier = "free" | "premium" | "enterprise";

/** Single source of truth for authorization across the app */
export type ActiveModeContext = {
  user_id: string;
  account_type: AccountType;
  active_mode: Mode | null;
  active_persona_id: string | null;
  permissions: Mode[];
  subscription_tier: SubscriptionTier;
};

export type ModePermissions = {
  romance: boolean;
  friends: boolean;
  business: boolean;
  events: boolean; // always true
};
