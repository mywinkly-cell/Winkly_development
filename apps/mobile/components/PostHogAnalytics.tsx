// apps/mobile/components/PostHogAnalytics.tsx
// Syncs auth identity with PostHog (identify on login, reset on logout) and tracks screen views.

import { useEffect } from "react";
import { usePathname } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useAuth } from "@/providers";

/** Call identify when user is set, reset when user is null. Renders nothing. */
export function PostHogIdentitySync() {
  const { user } = useAuth();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    if (user) {
      posthog.identify(user.id, {
        account_type: user.user_metadata?.account_type ?? undefined,
      });
    } else {
      posthog.reset();
    }
  }, [posthog, user]);

  return null;
}

/** Sends screen view to PostHog when route changes. Renders nothing. */
export function PostHogScreenTracker() {
  const pathname = usePathname();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog || !pathname) return;
    posthog.screen(pathname);
  }, [posthog, pathname]);

  return null;
}
