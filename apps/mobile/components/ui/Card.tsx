// apps/mobile/components/ui/Card.tsx
// Token-based Card, mode-aware optional (spec v8.1)

import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Colors, Layout } from "@/constants/tokens";

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
};

export function Card({ children, style, elevated = true }: CardProps) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: Layout.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  elevated: {
    shadowColor: Colors.softBlack,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
