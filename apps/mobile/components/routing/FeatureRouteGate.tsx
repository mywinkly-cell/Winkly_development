// FeatureRouteGate — layout-level guard for route groups behind a launch flag.
// Protects deep links and restored navigation state; RouteGuard applies the same rules globally.
// Replaces in an effect (not <Redirect>) to avoid layout update loops, matching the legacy routes.

import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { Routes } from "@/constants/routes";
import { BUSINESS_COMING_SOON_ROUTE } from "@/lib/routing/guards";
import { isAccountTypeParked } from "@/lib/modes/availability";

export function FeatureRouteGate({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const { accountType } = useAuth();
  const target = isAccountTypeParked(accountType) ? BUSINESS_COMING_SOON_ROUTE : Routes.modeSelection;

  useEffect(() => {
    if (!allowed) router.replace(target as never);
  }, [allowed, router, target]);

  if (!allowed) return null;
  return <>{children}</>;
}
