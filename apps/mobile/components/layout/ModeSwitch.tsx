// apps/mobile/components/layout/ModeSwitch.tsx
// ModeSwitch / ModeBadge — quick switch to mode selection (spec v8.1)

import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";

const MODE_ICONS: Record<Mode, string> = {
  romance: "💖",
  friends: "👥",
  business: "💼",
  events: "🎉",
};

type ModeSwitchProps = {
  currentMode: Mode;
};

export function ModeSwitch({ currentMode }: ModeSwitchProps) {
  const router = useRouter();

  const handlePress = () => {
    Haptics.selectionAsync();
    router.push("/(onboarding-personal)/mode-selection");
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.emoji}>{MODE_ICONS[currentMode]}</Text>
        <Text style={styles.label}>Switch mode</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 28,
    right: 24,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 40,
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.xl,
    shadowColor: Colors.softBlack,
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
    fontSize: 20,
    marginRight: Layout.spacing.sm,
  },
  label: {
    ...Typography.button,
    color: Colors.accentYellow,
  },
});
