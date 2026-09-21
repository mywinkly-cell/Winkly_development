import React from "react";
import { Stack } from "expo-router";
import {
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";
import { FeatureRouteGate } from "@/components/routing/FeatureRouteGate";
import { useAuth } from "@/providers/AuthProvider";
import { canAccessBusinessRoutes } from "@/lib/modes/availability";

const BUSINESS_HUB_SCREEN_NAMES = ["index", "discover", "analytics", "chats", "planner"] as const;

/** Business mode stack: instant hub tabs (includes BA for business accounts). Gated by launch flags. */
export default function BusinessModeLayout() {
  const { accountType } = useAuth();
  return (
    <FeatureRouteGate allowed={canAccessBusinessRoutes(accountType)}>
      <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })}>
        {BUSINESS_HUB_SCREEN_NAMES.map((name) => (
          <Stack.Screen key={name} name={name} options={premiumHubStackScreenOptions()} />
        ))}
      </Stack>
    </FeatureRouteGate>
  );
}
