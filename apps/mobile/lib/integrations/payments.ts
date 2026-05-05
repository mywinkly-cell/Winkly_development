// apps/mobile/lib/integrations/payments.ts
// Subscription/payment facade: tier is read from Supabase; store billing still TODO.

import { Linking } from "react-native";
import { supabase } from "@/lib/supabase";
import { normalizeSubscriptionTier } from "@/lib/billing/subscriptionTier";
import type { SubscriptionTier } from "@/types";

export type { SubscriptionTier };

export type SubscriptionStatus = {
  tier: SubscriptionTier;
  isActive: boolean;
  /** ISO date string when available */
  activeUntil?: string | null;
  /** True when App Store / Play / Stripe purchase flow is wired */
  isBillingConfigured: boolean;
};

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) {
    return {
      tier: "free",
      isActive: false,
      activeUntil: null,
      isBillingConfigured: false,
    };
  }

  let row: {
    subscription_tier?: string | null;
    is_premium?: boolean | null;
    premium_until?: string | null;
  } | null = null;

  const full = await supabase
    .from("users")
    .select("subscription_tier, is_premium, premium_until")
    .eq("id", uid)
    .maybeSingle();

  row = full.data;
  const err = full.error as { code?: string } | null;
  if (err?.code === "42703") {
    const fb = await supabase.from("users").select("is_premium, premium_until").eq("id", uid).maybeSingle();
    row = fb.data as typeof row;
  }

  const tier = normalizeSubscriptionTier(row?.subscription_tier ?? undefined, !!row?.is_premium);

  return {
    tier,
    isActive: tier !== "free",
    activeUntil: row?.premium_until ?? null,
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

