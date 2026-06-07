// Main signed-in hub: Modes | Chats | Planner

import React from "react";
import { Tabs } from "expo-router";
import { MainTabBar } from "@/components/layout/MainTabBar";
import { Colors } from "@/constants/tokens";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: Colors.backgroundLight },
      }}
    >
      <Tabs.Screen name="mode-selection" options={{ title: "Modes" }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="planner" options={{ title: "Planner" }} />
    </Tabs>
  );
}
