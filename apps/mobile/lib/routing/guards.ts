// apps/mobile/lib/routing/guards.ts
// Pure route-guard decision logic for components/RouteGuard.
// Returns a declarative action so the navigation effect stays trivial/testable.

import type { Mode } from "@/types";
import {
  canAccessBusinessRoutes,
  isAccountTypeAvailable,
  isAccountTypeParked,
  LAUNCH_FLAGS,
  type LaunchFlags,
} from "@/lib/modes/availability";

/** Landing screen for existing accounts whose type isn't live yet (business accounts in the beta). */
export const BUSINESS_COMING_SOON_ROUTE = "/(auth)/business-coming-soon";
const BUSINESS_COMING_SOON_SEGMENT = "business-coming-soon";

export const AUTH_ROUTES = [
  "splash",
  "welcome-intro",
  "terms-cookies",
  "get-started",
  "welcome-back-setup",
  "intro",
  "signup",
  "signin",
  "verify",
  "email-verified",
  "callback",
  "reset-password",
  "reset-confirm",
] as const;

const MODE_SEGMENTS: Mode[] = ["romance", "friends", "business", "events"];

export function isAuthRoute(path: string): boolean {
  return AUTH_ROUTES.some((r) => path.includes(r));
}

export function isModeRoute(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  return MODE_SEGMENTS.some((m) => segments.includes(m));
}

/** True for any route under a `business` segment ((modes)/business/*, business/*). */
export function isBusinessRoute(path: string): boolean {
  return path.split("/").filter(Boolean).includes("business");
}

/** True for the business-account onboarding group. */
export function isBusinessOnboardingRoute(path: string): boolean {
  return path.split("/").filter(Boolean).includes("(onboarding-business)");
}

export type RouteAction =
  | { type: "none" }
  | { type: "redirect"; to: string };

export type RouteGuardInput = {
  loading: boolean;
  modeLoading: boolean;
  hasSession: boolean;
  path: string;
  activeMode: Mode | null;
  permissions: readonly Mode[];
  /** user_metadata.account_type; parked account types are pinned to their coming-soon screen. */
  accountType?: string | null;
  flags?: LaunchFlags;
};

/**
 * Decide what the guard should do for the current route/auth/mode state.
 * - Block unauthenticated access to non-auth routes (-> splash).
 * - Pin accounts of a not-yet-live type to the coming-soon screen (auth routes stay reachable).
 * - Block Business routes while Business mode is off (deep links, stale nav state).
 * - Block entering a mode route the user lacks permission for (-> mode-selection).
 * - Otherwise do nothing.
 */
export function resolveRouteAction(input: RouteGuardInput): RouteAction {
  if (input.loading || input.modeLoading) return { type: "none" };

  if (!input.hasSession && !isAuthRoute(input.path)) {
    return { type: "redirect", to: "/(auth)/splash" };
  }

  const flags = input.flags ?? LAUNCH_FLAGS;
  const onComingSoon = input.path.split("/").includes(BUSINESS_COMING_SOON_SEGMENT);

  if (input.hasSession && isAccountTypeParked(input.accountType, flags)) {
    if (onComingSoon || isAuthRoute(input.path)) return { type: "none" };
    return { type: "redirect", to: BUSINESS_COMING_SOON_ROUTE };
  }

  if (input.hasSession && isBusinessRoute(input.path) && !canAccessBusinessRoutes(input.accountType, flags)) {
    return { type: "redirect", to: "/(tabs)/mode-selection" };
  }

  if (input.hasSession && isBusinessOnboardingRoute(input.path) && !isAccountTypeAvailable("business", flags)) {
    return { type: "redirect", to: "/(tabs)/mode-selection" };
  }

  if (input.hasSession && isModeRoute(input.path) && input.activeMode) {
    if (!input.permissions.includes(input.activeMode)) {
      return { type: "redirect", to: "/(tabs)/mode-selection" };
    }
  }

  return { type: "none" };
}
