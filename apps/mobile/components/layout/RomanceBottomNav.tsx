// ────────────────────────────────────────────────
// Romance Mode Bottom Nav — Home, Discover, Switch (center), Chats, Planner (Matches live in Chats sub-bar)
// Same on all Romance tab screens
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { ModeSwitchCenterButton } from "@/components/layout/ModeSwitchCenterButton";

type RomanceTab = "home" | "discover" | "chats" | "planner";

function getActiveTab(pathname: string): RomanceTab {
  if (!pathname) return "home";
  if (pathname.includes("/discover")) return "discover";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function RomanceBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const activeTab = getActiveTab(pathname ?? "");

  const nav = (tab: RomanceTab) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace("/(modes)/romance");
    else if (tab === "discover") router.replace("/(modes)/romance/discover");
    else if (tab === "chats") router.replace("/(modes)/romance/chats");
    else router.replace("/(modes)/romance/planner");
  };

  const isActive = (tab: RomanceTab) => activeTab === tab;
  const activeColor = Colors.romance.primary;
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
        overflow: "visible",
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
        onPress={() => nav("discover")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Discover"
      >
        <Ionicons name="search" size={24} color={isActive("discover") ? activeColor : inactiveColor} />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("discover") ? activeColor : inactiveColor }]}>
          Discover
        </Text>
      </Pressable>

      <ModeSwitchCenterButton mode="romance" />

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
