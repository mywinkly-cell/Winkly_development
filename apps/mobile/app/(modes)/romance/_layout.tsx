// apps/mobile/app/(modes)/romance/_layout.tsx
// Romance mode stack. Screens render their own bottom nav (RomanceBottomNav).

import React from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";

export default function RomanceLayout() {
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
