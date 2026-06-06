// apps/mobile/lib/routing/splash.ts
// Pure splash routing decisions (cold start).

export type SplashDestination =
  | { route: "welcome-intro" }
  | { route: "signin"; staleSession?: boolean }
  | { route: "verify" }
  | { route: "mode-selection" }
  | { route: "welcome-back-setup" }
  | { route: "welcome-intro"; invalidSession: true };

export type SplashUnauthenticatedInput = {
  introSeen: boolean;
};

export type SplashAuthenticatedInput = {
  emailConfirmed: boolean;
  recentActivity: boolean;
  profileComplete: boolean;
};

export function resolveUnauthenticatedSplashRoute(
  input: SplashUnauthenticatedInput
): SplashDestination {
  if (!input.introSeen) return { route: "welcome-intro" };
  return { route: "signin" };
}

export function resolveAuthenticatedSplashRoute(
  input: SplashAuthenticatedInput
): SplashDestination {
  if (!input.emailConfirmed) return { route: "verify" };
  if (!input.recentActivity) return { route: "signin", staleSession: true };
  if (input.profileComplete) return { route: "mode-selection" };
  return { route: "welcome-back-setup" };
}

export function isPersonalProfileComplete(profile: {
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  birthday?: string | null;
  city?: string | null;
  core_photos?: unknown;
} | null | undefined): boolean {
  const u = profile;
  const hasCore = !!(
    u?.first_name?.trim?.() &&
    u?.last_name?.trim?.() &&
    u?.gender?.trim?.() &&
    u?.birthday &&
    u?.city?.trim?.()
  );
  const hasPhoto = Array.isArray(u?.core_photos) ? u.core_photos.filter(Boolean).length > 0 : false;
  return hasCore && hasPhoto;
}

export function isBusinessProfileComplete(profile: {
  business_name?: string | null;
} | null | undefined): boolean {
  return !!(profile as { business_name?: string } | null | undefined)?.business_name?.trim?.();
}
