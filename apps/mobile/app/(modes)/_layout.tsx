// apps/mobile/app/(modes)/_layout.tsx
// Parent navigator for the four mode sub-apps (Identity Firewall).
// Each mode (romance/friends/business/events) is an isolated nested stack so
// switching modes via router.replace() fully resets the stack for that mode.

import React from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";

export default function ModesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: Platform.OS === "android" ? "slide_from_right" : "default",
      }}
    >
      <Stack.Screen name="romance" />
      <Stack.Screen name="friends" />
      <Stack.Screen name="business" />
      <Stack.Screen name="events" />
    </Stack>
  );
}
