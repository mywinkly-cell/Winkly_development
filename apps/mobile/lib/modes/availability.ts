// apps/mobile/lib/modes/availability.ts
// Single source of truth for which modes / account types are live in this build.
// UI must call these helpers instead of reading config/flags inline, so launch state stays
// auditable and the gating logic is unit-tested (__tests__/modeAvailability.test.ts).

import { BUSINESS_ACCOUNTS_ENABLED, BUSINESS_MODE_ENABLED } from "@/config/flags";
import type { WhoJoining } from "@/lib/ai/conciergePlanningFlow";
import type { Mode } from "@/types";

export type LaunchFlags = {
  businessModeEnabled: boolean;
  businessAccountsEnabled: boolean;
};

export const LAUNCH_FLAGS: LaunchFlags = {
  businessModeEnabled: BUSINESS_MODE_ENABLED,
  businessAccountsEnabled: BUSINESS_ACCOUNTS_ENABLED,
};

export type AccountType = "personal" | "business";

/** Whether a mode can be enabled/entered. Unavailable modes render as "Coming soon". */
export function isModeAvailable(mode: Mode, flags: LaunchFlags = LAUNCH_FLAGS): boolean {
  if (mode === "business") return flags.businessModeEnabled;
  return true;
}

/** Whether an account type can be created/used. */
export function isAccountTypeAvailable(type: AccountType, flags: LaunchFlags = LAUNCH_FLAGS): boolean {
  if (type === "business") return flags.businessAccountsEnabled;
  return true;
}

/** An existing account whose type is not live yet (e.g. a business account during the beta). */
export function isAccountTypeParked(accountType: string | null | undefined, flags: LaunchFlags = LAUNCH_FLAGS): boolean {
  return accountType === "business" && !isAccountTypeAvailable("business", flags);
}

/** Concierge "who's joining" options tied to a mode are hidden while that mode is off. */
export function isWhoJoiningAvailable(who: WhoJoining, flags: LaunchFlags = LAUNCH_FLAGS): boolean {
  if (who === "invite_business") return isModeAvailable("business", flags);
  return true;
}

/**
 * Business routes ((modes)/business/*, business/*) serve both private users in Business mode and
 * business accounts, so they're reachable when either side is live for this user.
 */
export function canAccessBusinessRoutes(accountType: string | null | undefined, flags: LaunchFlags = LAUNCH_FLAGS): boolean {
  if (isModeAvailable("business", flags)) return true;
  return accountType === "business" && isAccountTypeAvailable("business", flags);
}
