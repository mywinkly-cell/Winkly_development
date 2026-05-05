import type { SubscriptionTier } from "@/types";

const VALID: SubscriptionTier[] = ["free", "super", "premium", "enterprise"];

/** Maps `users.subscription_tier` (or legacy flags) to a known tier. */
export function normalizeSubscriptionTier(
  raw: string | null | undefined,
  legacyPremium?: boolean,
): SubscriptionTier {
  const s = String(raw ?? "").trim().toLowerCase();
  if (VALID.includes(s as SubscriptionTier)) return s as SubscriptionTier;
  if (legacyPremium) return "premium";
  return "free";
}
