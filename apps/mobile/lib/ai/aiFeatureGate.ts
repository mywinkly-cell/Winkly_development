// ────────────────────────────────────────────────
// AI feature gating by subscription tier
// Free = no AI. Super = limited AI. Premium = full concierge.
// ────────────────────────────────────────────────

import type { SubscriptionTier } from "@/types";

/** AI features that can be gated. */
export type AIFeature =
  | "smart_matching"      // profile-based match order (Super+)
  | "event_suggestions"   // better event suggestions (Super+)
  | "planning_ideas"     // activity/place ideas from interests, location, wishlist (Super+)
  | "chat_opener"        // first message / icebreaker suggestion (Super+)
  | "match_bridge"       // AI date idea for a new romance match (Premium only)
  | "concierge";         // full concierge: weather, reschedule, trip planning (Premium only)

const SUPER_FEATURES: AIFeature[] = [
  "smart_matching",
  "event_suggestions",
  "planning_ideas",
  "chat_opener",
];

const PREMIUM_ONLY_FEATURES: AIFeature[] = ["concierge", "match_bridge"];

/**
 * Whether the given tier has access to the given AI feature.
 */
export function canUseAIFeature(tier: SubscriptionTier, feature: AIFeature): boolean {
  if (tier === "free") return false;
  if (PREMIUM_ONLY_FEATURES.includes(feature)) return tier === "premium" || tier === "enterprise";
  if (SUPER_FEATURES.includes(feature)) return tier === "super" || tier === "premium" || tier === "enterprise";
  return false;
}

/**
 * Whether the user has any AI access (Super or Premium).
 */
export function hasAnyAIAccess(tier: SubscriptionTier): boolean {
  return tier === "super" || tier === "premium" || tier === "enterprise";
}

/**
 * For the Spark icon: is this feature available (Spark on) or locked (Spark greyed, show upsell on tap)?
 */
export function getSparkAvailable(tier: SubscriptionTier, feature: AIFeature): boolean {
  return canUseAIFeature(tier, feature);
}

/**
 * Suggested upgrade tier for upsell when user taps Spark on a locked feature.
 * - For concierge: "premium"
 * - For other features: "super" (or "premium" if you want to push Premium)
 */
export function getSuggestedTierForFeature(feature: AIFeature): "super" | "premium" {
  return PREMIUM_ONLY_FEATURES.includes(feature) ? "premium" : "super";
}
