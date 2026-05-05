// ────────────────────────────────────────────────
// Winkly Mode Switch Button – Final v7.0
// © 2025 Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Floating button used inside all modes to allow
// quick switching back to Mode Selection screen.
// ────────────────────────────────────────────────

import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors, Layout, Typography } from "@/constants/tokens";

type ModeSwitchButtonProps = {
  currentMode: "romance" | "friends" | "business" | "events";
  /** When true, raises the button above the bottom bar */
  aboveBottomBar?: boolean;
};

const MODE_ICON: Record<string, string> = {
  romance: "💖",
  friends: "👥",
  business: "💼",
  events: "🎉",
};

export default function ModeSwitchButton({ currentMode, aboveBottomBar }: ModeSwitchButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    Haptics.selectionAsync();
    router.push("/(onboarding-personal)/mode-selection");
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.container, aboveBottomBar && { bottom: 88 }]}
    >
      <View style={styles.inner}>
        <Text style={styles.emoji}>{MODE_ICON[currentMode]}</Text>
        <Text style={styles.label}>Switch</Text>
      </View>
    </TouchableOpacity>
  );
}

// ────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 28,
    right: 24,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
  },
  emoji: {
    fontSize: 22,
    marginRight: 6,
  },
  label: {
    ...Typography.button,
    color: Colors.accentYellow,
  },
});
