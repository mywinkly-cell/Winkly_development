// apps/mobile/lib/integrations/payments.ts
// Subscription/payment facade (currently placeholder until billing integration).

import { Linking } from "react-native";

export type SubscriptionTier = "free" | "super" | "premium";

export type SubscriptionStatus = {
  tier: SubscriptionTier;
  isActive: boolean;
  /** ISO date string when available */
  activeUntil?: string | null;
  /** True when billing integration is wired */
  isBillingConfigured: boolean;
};

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  return {
    tier: "free",
    isActive: true,
    activeUntil: null,
    isBillingConfigured: false,
  };
}

export type PurchaseResult =
  | { ok: true; tier: Exclude<SubscriptionTier, "free"> }
  | { ok: false; reason: "not_configured" | "cancelled" | "failed"; message?: string };

export async function purchase(_tier: Exclude<SubscriptionTier, "free">): Promise<PurchaseResult> {
  return { ok: false, reason: "not_configured", message: "Billing integration not configured yet." };
}

/**
 * Best-effort: open OS subscription management (iOS/Android store pages).
 * You can later replace this with Stripe customer portal / in-app billing deep links.
 */
export async function openManageSubscriptions(): Promise<boolean> {
  const urls = [
    "https://apps.apple.com/account/subscriptions",
    "https://play.google.com/store/account/subscriptions",
  ];

  for (const url of urls) {
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
      return true;
    }
  }
  return false;
}

