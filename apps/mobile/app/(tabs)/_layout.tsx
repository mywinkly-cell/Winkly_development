// Main signed-in hub: Modes | Chats | Planner

import React from "react";
import { Tabs } from "expo-router";
import { MainTabBar } from "@/components/layout/MainTabBar";
import { useAppTheme } from "@/constants/design-system";

export default function TabsLayout() {
  const theme = useAppTheme();
  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen name="mode-selection" options={{ title: "Modes" }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="planner" options={{ title: "Planner" }} />
    </Tabs>
  );
}
