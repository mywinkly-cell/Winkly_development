// apps/mobile/components/layout/PlannerButton.tsx
// Small reusable CTA button for planner actions.

import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type PlannerButtonProps = {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  style?: ViewStyle;
};

export function PlannerButton({ title, icon = "star", onPress, style }: PlannerButtonProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.btn, style]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={Colors.white} />
      <Text style={styles.text} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryViolet,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Layout.radii.control,
  },
  text: {
    ...Typography.button,
    color: Colors.white,
    fontSize: 14,
    lineHeight: 18,
  },
});

