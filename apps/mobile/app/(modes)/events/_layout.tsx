// apps/mobile/app/(modes)/events/_layout.tsx
// Events mode stack. Screens render EventsBottomNav (Home, Discover, Chats, Planner).

import React from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";

export default function EventsLayout() {
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
