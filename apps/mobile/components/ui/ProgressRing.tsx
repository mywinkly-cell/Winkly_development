// apps/mobile/components/ui/ProgressRing.tsx
// Completion indicator — circular badge with % (spec v8.1)

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Typography } from "@/constants/tokens";

type ProgressRingProps = {
  progress: number;
  size?: number;
  showLabel?: boolean;
};

export function ProgressRing({ progress, size = 48, showLabel = true }: ProgressRingProps) {
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <View style={[styles.wrapper, { width: size, height: size, borderRadius: size / 2 }]}>
      {showLabel && (
        <View style={StyleSheet.absoluteFill}>
          <Text style={[styles.label, { fontSize: size * 0.24 }]}>{Math.round(pct)}%</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.backgroundLight,
  },
  label: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
});
