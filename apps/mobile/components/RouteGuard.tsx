// apps/mobile/components/RouteGuard.tsx
// Route guards: auth + active mode (Identity Firewall)
// Screens handle their own onboarding redirects to avoid conflicts.

import React, { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useModeContext } from "@/providers/ModeContextProvider";

const AUTH_ROUTES = ["splash", "welcome-intro", "terms-cookies", "get-started", "welcome-back-setup", "intro", "signup", "signin", "verify", "email-verified", "callback", "reset-password", "reset-confirm"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { context, loading: modeLoading } = useModeContext();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || modeLoading) return;

    const path = segments.join("/");
    const isAuthRoute = AUTH_ROUTES.some((r) => path.includes(r));

    if (!session && !isAuthRoute) {
      router.replace("/(auth)/splash");
      return;
    }

    const isModeRoute = path.includes("romance") || path.includes("friends") || path.includes("business") || path.includes("events");
    if (session && isModeRoute && context.active_mode) {
      const allowed = context.permissions.includes(context.active_mode);
      if (!allowed) {
        router.replace("/(onboarding-personal)/mode-selection");
      }
    }
  }, [loading, modeLoading, session, context, segments, router]);

  return <>{children}</>;
}
