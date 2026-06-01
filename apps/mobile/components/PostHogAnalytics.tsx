// apps/mobile/components/PostHogAnalytics.tsx
// Syncs auth identity with PostHog (identify on login, reset on logout) and tracks screen views.

import { useEffect } from "react";
import { usePathname } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useAuth } from "@/providers";
import { setAnalyticsClient } from "@/lib/analytics";

/** Call identify when user is set, reset when user is null. Renders nothing. */
export function PostHogIdentitySync() {
  const { user } = useAuth();
  const posthog = usePostHog();

  // Register PostHog as the backing client for the decoupled analytics module
  // (lib/analytics + lib/analytics/events), so track() works app-wide.
  useEffect(() => {
    if (!posthog) {
      setAnalyticsClient(null);
      return;
    }
    setAnalyticsClient({
      identify: (id, props) => posthog.identify(id, props as Parameters<typeof posthog.identify>[1]),
      reset: () => posthog.reset(),
      capture: (event, props) => posthog.capture(event, props as Parameters<typeof posthog.capture>[1]),
      screen: (name, props) => posthog.screen(name, props as Parameters<typeof posthog.screen>[1]),
    });
    return () => setAnalyticsClient(null);
  }, [posthog]);

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
