import React from "react";
import { Stack } from "expo-router";
import {
  MODE_HUB_SCREEN_NAMES,
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

/** Mode sub-app stack: instant hub tabs, push animation for detail screens. */
export function ModeStackLayout() {
  return (
    <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })}>
      {MODE_HUB_SCREEN_NAMES.map((name) => (
        <Stack.Screen key={name} name={name} options={premiumHubStackScreenOptions()} />
      ))}
    </Stack>
  );
}
