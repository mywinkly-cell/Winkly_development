// apps/mobile/lib/mode/permissions.ts
// Pure authorization resolution for ModeContextProvider (Identity Firewall).
// Tested in isolation because a permissions bug = a privacy/data-leak bug.

import type { AccountType, Mode, SubscriptionTier } from "@/types";

const VALID_TIERS: SubscriptionTier[] = ["free", "super", "premium", "enterprise"];

/**
 * Resolve the set of modes a user may enter.
 * - Events is always allowed.
 * - Business accounts get Business (no romance/friends).
 * - Personal accounts unlock romance/friends/business per their sub-profiles.
 */
export function resolvePermissions(accountType: AccountType, subProfileModes: readonly string[]): Mode[] {
  const permissions: Mode[] = ["events"];
  if (accountType === "personal") {
    const modes = new Set(subProfileModes);
    if (modes.has("romance")) permissions.push("romance");
    if (modes.has("friends")) permissions.push("friends");
    if (modes.has("business")) permissions.push("business");
  } else {
    permissions.push("business");
  }
  return permissions;
}

/**
 * Resolve the effective subscription tier.
 * In dev we force `premium` to exercise paid paths. In prod we trust the DB
 * tier when valid, else fall back to the legacy is_premium boolean.
 */
export function resolveSubscriptionTier(opts: {
  tierFromDb?: string | null;
  isPremium?: boolean | null;
  isDev?: boolean;
}): SubscriptionTier {
  if (opts.isDev) return "premium";
  const tier = opts.tierFromDb as SubscriptionTier | undefined;
  if (tier && VALID_TIERS.includes(tier)) return tier;
  return opts.isPremium ? "premium" : "free";
}

/**
 * Keep an already-selected active mode only if the (re-)loaded permissions
 * still include it; otherwise clear it. Prevents a stale mode from outliving
 * the access that granted it.
 */
export function reconcileActiveMode(activeMode: Mode | null, permissions: readonly Mode[]): Mode | null {
  return activeMode && permissions.includes(activeMode) ? activeMode : null;
}
