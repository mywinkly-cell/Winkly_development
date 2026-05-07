import React from "react";
import { View, Platform } from "react-native";
import { Stack } from "expo-router";
import { GlobalBottomBar } from "@/components/layout/GlobalBottomBar";

export default function PlannerLayout() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            animation: Platform.OS === "android" ? "slide_from_right" : "default",
          }}
        />
      </View>
      <GlobalBottomBar />
    </View>
  );
}

