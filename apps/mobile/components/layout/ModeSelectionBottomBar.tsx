// ────────────────────────────────────────────────
// Mode Selection Bottom Bar — Home | Chats | Planner
// Used on mode-selection, mode-selection/chats, mode-selection/planner
// Home = back to mode-selection grid
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

type Tab = "home" | "chats" | "planner";

function getActiveTab(pathname: string): Tab {
  if (!pathname) return "home";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function ModeSelectionBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const activeTab = getActiveTab(pathname ?? "");

  const nav = (tab: Tab) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace("/mode-selection");
    else if (tab === "chats") router.replace("/chats");
    else router.replace("/planner");
  };

  const isActive = (tab: Tab) => activeTab === tab;
  const activeColor = Colors.primaryViolet;
  const inactiveColor = Colors.gray500;

  const barHeight = Layout.bottomBarHeight + insets.bottom;
  const paddingBottom = 16 + insets.bottom;

  return (
    <View
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
      <Pressable
        onPress={() => nav("home")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Home"
      >
        <Ionicons name="home" size={24} color={isActive("home") ? activeColor : inactiveColor} />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("home") ? activeColor : inactiveColor }]}>
          Home
        </Text>
      </Pressable>

      <Pressable
        onPress={() => nav("chats")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Chats"
      >
        <Ionicons name="chatbubble-outline" size={24} color={isActive("chats") ? activeColor : inactiveColor} />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("chats") ? activeColor : inactiveColor }]}>
          Chats
        </Text>
      </Pressable>

      <Pressable
        onPress={() => nav("planner")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Planner"
      >
        <Ionicons name="calendar-outline" size={24} color={isActive("planner") ? activeColor : inactiveColor} />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("planner") ? activeColor : inactiveColor }]}>
          Planner
        </Text>
      </Pressable>
    </View>
  );
}
