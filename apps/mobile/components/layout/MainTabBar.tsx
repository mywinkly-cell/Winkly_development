// MainTabBar — Global hub tabs: Modes | Chats | Planner (expo-router Tabs)

import React from "react";
import { View, Text, Pressable } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { Colors, Typography, Layout } from "@/constants/tokens";

const TAB_CONFIG = [
  { name: "mode-selection", label: "Modes", icon: "grid-outline" as const, activeIcon: "grid" as const },
  { name: "chats", label: "Chats", icon: "chatbubble-outline" as const, activeIcon: "chatbubble" as const },
  { name: "planner", label: "Planner", icon: "calendar-outline" as const, activeIcon: "calendar" as const },
] as const;

export function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeColor = Colors.primaryViolet;
  const inactiveColor = Colors.gray500;
  const barHeight = Layout.bottomBarHeight + insets.bottom;
  const paddingBottom = 16 + insets.bottom;

  return (
    <View
      testID="bottom-bar"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        height: barHeight,
        paddingTop: 12,
        paddingBottom,
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.gray200,
        shadowColor: "#1C1C1E",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const config = TAB_CONFIG.find((t) => t.name === route.name);
        if (!config) return null;

        const focused = state.index === index;
        const color = focused ? activeColor : inactiveColor;
        const iconName = focused ? config.activeIcon : config.icon;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              Haptics.selectionAsync();
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
            accessibilityLabel={config.label}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
          >
            <Ionicons name={iconName} size={24} color={color} />
            <Text style={[Typography.caption, { marginTop: 4, color }]}>{config.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
