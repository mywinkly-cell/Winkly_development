// apps/mobile/lib/monitoring/sentry.ts
// Thin wrapper around @sentry/react-native. Crash reporting is fully gated on
// EXPO_PUBLIC_SENTRY_DSN: with no DSN every function here is a safe no-op, so
// dev/Expo Go and DSN-less builds behave exactly as before.

import * as Sentry from "@sentry/react-native";
import { getPublicEnv } from "@/lib/env";
import { isOfflineError } from "@/lib/network/connectivity";

let _initialized = false;

/** Initialize crash reporting once, only when a DSN is configured. */
export function initMonitoring(): void {
  if (_initialized) return;
  const { sentryDsn } = getPublicEnv();
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    // Conservative defaults; tune sampling per traffic after launch.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableAutoSessionTracking: true,
    // Don't report in dev so local errors don't pollute production issues.
    enabled: !__DEV__,
    beforeSend(event, hint) {
      // Offline failures are expected/handled by the UI — don't treat as crashes.
      if (isOfflineError(hint?.originalException)) return null;
      return event;
    },
  });
  _initialized = true;
}

export function isMonitoringEnabled(): boolean {
  return _initialized;
}

/** Attach the signed-in user to subsequent events (or clear on sign-out). */
export function setMonitoringUser(user: { id: string; account_type?: string } | null): void {
  if (!_initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, account_type: user.account_type });
  } else {
    Sentry.setUser(null);
  }
}

/** Manually report a handled error with optional context. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!_initialized) return;
  if (isOfflineError(error)) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Leave a breadcrumb for the next event's trail. */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!_initialized) return;
  Sentry.addBreadcrumb({ message, data, level: "info" });
}
