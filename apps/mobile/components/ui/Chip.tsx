// apps/mobile/components/ui/Chip.tsx
// Reusable selectable chip.

import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { Colors, Typography } from "@/constants/tokens";

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  selectedStyle?: ViewStyle;
};

export function Chip({ label, selected, onPress, style, textStyle, selectedStyle }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.base, selected ? styles.selected : styles.unselected, style, selected ? selectedStyle : null]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected: !!selected }}
    >
      <Text style={[styles.text, selected ? styles.textSelected : styles.textUnselected, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  selected: {
    backgroundColor: Colors.primaryViolet,
    borderColor: Colors.primaryViolet,
  },
  unselected: {
    backgroundColor: Colors.white,
    borderColor: Colors.gray200,
  },
  text: { ...Typography.caption },
  textSelected: { color: Colors.accentYellow, fontWeight: "700" as const },
  textUnselected: { color: Colors.gray700 },
});

