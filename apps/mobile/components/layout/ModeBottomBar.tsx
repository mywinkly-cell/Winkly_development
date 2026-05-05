// ────────────────────────────────────────────────
// Winkly Mode Bottom Bar – Chats, Switch (center), Planner
// Shared across Friends, Business, Events mode screens
// When mode is friends/business/events, Chats and Planner go to mode-specific screens
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { ModeSwitchCenterButton } from "@/components/layout/ModeSwitchCenterButton";

type ModeBottomBarProps = {
  /** When set, Chats and Planner navigate to mode-specific screens; Switch button uses this mode */
  mode?: "friends" | "business" | "events";
};

export function ModeBottomBar({ mode }: ModeBottomBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onChatsPress = () => {
    Haptics.selectionAsync();
    if (mode === "friends") router.replace("/(modes)/friends/chats");
    else if (mode === "business") router.replace("/(modes)/business/chats");
    else router.push("/chats");
  };

  const onPlannerPress = () => {
    Haptics.selectionAsync();
    if (mode === "friends") router.replace("/(modes)/friends/planner");
    else if (mode === "business") router.replace("/(modes)/business/planner");
    else if (mode === "events") router.replace("/(modes)/events/planner");
    else router.push("/planner");
  };

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
        onPress={onChatsPress}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Chats"
      >
        <Ionicons name="chatbubble-outline" size={24} color={Colors.textPrimary} />
        <Text style={{ ...Typography.caption, color: Colors.textPrimary, marginTop: 4 }}>Chats</Text>
      </Pressable>

      {mode ? <ModeSwitchCenterButton mode={mode} /> : null}

      <Pressable
        onPress={onPlannerPress}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 48, minHeight: 48 }}
        accessibilityLabel="Planner"
      >
        <Ionicons name="calendar-outline" size={24} color={Colors.textPrimary} />
        <Text style={{ ...Typography.caption, color: Colors.textPrimary, marginTop: 4 }}>Planner</Text>
      </Pressable>
    </View>
  );
}
