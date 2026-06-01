// apps/mobile/app/(modes)/business/_layout.tsx
// Business mode stack. Screens render their own bottom nav.

import React from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";

export default function BusinessLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: Platform.OS === "android" ? "slide_from_right" : "default",
      }}
    />
  );
}
