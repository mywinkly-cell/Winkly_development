// apps/mobile/lib/routing/guards.ts
// Pure route-guard decision logic for components/RouteGuard.
// Returns a declarative action so the navigation effect stays trivial/testable.

import type { Mode } from "@/types";

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
};

/**
 * Decide what the guard should do for the current route/auth/mode state.
 * - Block unauthenticated access to non-auth routes (-> splash).
 * - Block entering a mode route the user lacks permission for (-> mode-selection).
 * - Otherwise do nothing.
 */
export function resolveRouteAction(input: RouteGuardInput): RouteAction {
  if (input.loading || input.modeLoading) return { type: "none" };

  if (!input.hasSession && !isAuthRoute(input.path)) {
    return { type: "redirect", to: "/(auth)/splash" };
  }

  if (input.hasSession && isModeRoute(input.path) && input.activeMode) {
    if (!input.permissions.includes(input.activeMode)) {
      return { type: "redirect", to: "/mode-selection" };
    }
  }

  return { type: "none" };
}
