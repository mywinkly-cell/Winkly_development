// apps/mobile/components/RouteGuard.tsx
// Route guards: auth + active mode (Identity Firewall)
// Screens handle their own onboarding redirects to avoid conflicts.
// Decision logic lives in lib/routing/guards (pure + unit-tested).

import React, { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useModeContext } from "@/providers/ModeContextProvider";
import { resolveRouteAction } from "@/lib/routing/guards";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { context, loading: modeLoading } = useModeContext();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const action = resolveRouteAction({
      loading,
      modeLoading,
      hasSession: Boolean(session),
      path: segments.join("/"),
      activeMode: context.active_mode,
      permissions: context.permissions,
    });
    if (action.type === "redirect") {
      router.replace(action.to as never);
    }
  }, [loading, modeLoading, session, context, segments, router]);

  return <>{children}</>;
}
