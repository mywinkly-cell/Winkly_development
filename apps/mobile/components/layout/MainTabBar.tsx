// MainTabBar — Global hub tabs: Modes | Chats | Planner (expo-router Tabs)

import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { Colors, Typography, Layout } from "@/constants/tokens";

export function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const tabConfig = useMemo(
    () =>
      [
        { name: "mode-selection", label: t("nav.modes"), icon: "grid-outline" as const, activeIcon: "grid" as const },
        { name: "chats", label: t("modes.chats"), icon: "chatbubble-outline" as const, activeIcon: "chatbubble" as const },
        { name: "planner", label: t("modes.planner"), icon: "calendar-outline" as const, activeIcon: "calendar" as const },
      ] as const,
    [t, i18n.language]
  );
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
        const config = tabConfig.find((tab) => tab.name === route.name);
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
