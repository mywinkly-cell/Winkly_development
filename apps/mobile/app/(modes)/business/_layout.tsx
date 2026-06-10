import React from "react";
import { Stack } from "expo-router";
import {
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

const BUSINESS_HUB_SCREEN_NAMES = ["index", "discover", "analytics", "chats", "planner"] as const;

/** Business mode stack: instant hub tabs (includes BA for business accounts). */
export default function BusinessModeLayout() {
  return (
    <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })}>
      {BUSINESS_HUB_SCREEN_NAMES.map((name) => (
        <Stack.Screen key={name} name={name} options={premiumHubStackScreenOptions()} />
      ))}
    </Stack>
  );
}
