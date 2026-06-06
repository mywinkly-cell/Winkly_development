// ────────────────────────────────────────────────
// Global Bottom Bar — Modes | Chats | Planner
// Used on global (no-mode) hubs like /chats and /planner
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable } from "react-native";
import { usePathname, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { Routes } from "@/constants/routes";
import { Colors, Typography, Layout } from "@/constants/tokens";

type Tab = "modes" | "chats" | "planner";

function getActiveTab(pathname: string): Tab {
  if (!pathname) return "modes";
  if (pathname.includes("/planner")) return "planner";
  if (pathname.includes("/chats")) return "chats";
  return "modes";
}

export function GlobalBottomBar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const insets = useSafeAreaInsets();
  const activeTab = getActiveTab(pathname);

  const nav = (tab: Tab) => {
    Haptics.selectionAsync();
    if (tab === "modes") router.replace(Routes.modeSelection);
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
        onPress={() => nav("modes")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Modes"
      >
        <Ionicons name="grid-outline" size={24} color={isActive("modes") ? activeColor : inactiveColor} />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("modes") ? activeColor : inactiveColor }]}>
          Modes
        </Text>
      </Pressable>

      <Pressable
        onPress={() => nav("chats")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Chats"
      >
        <Ionicons
          name="chatbubble-outline"
          size={24}
          color={isActive("chats") ? activeColor : inactiveColor}
        />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("chats") ? activeColor : inactiveColor }]}>
          Chats
        </Text>
      </Pressable>

      <Pressable
        onPress={() => nav("planner")}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Planner"
      >
        <Ionicons
          name="calendar-outline"
          size={24}
          color={isActive("planner") ? activeColor : inactiveColor}
        />
        <Text style={[Typography.caption, { marginTop: 4, color: isActive("planner") ? activeColor : inactiveColor }]}>
          Planner
        </Text>
      </Pressable>
    </View>
  );
}

