// apps/mobile/components/ui/PlannerItem.tsx
// Reusable planner list item card.

import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type PlannerItemProps = {
  title: string;
  subtitle?: string;
  timeLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: ViewStyle;
  rightSlot?: React.ReactNode;
};

export function PlannerItem({ title, subtitle, timeLabel, icon = "calendar-outline", onPress, style, rightSlot }: PlannerItemProps) {
  const Container: React.ElementType = onPress ? Pressable : View;
  const props = onPress ? { onPress, style: [styles.card, style] } : { style: [styles.card, style] };

  return (
    <Container {...(props as any)} accessibilityRole={onPress ? "button" : undefined}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={Colors.primaryViolet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightSlot ? (
          <View style={{ marginLeft: 10 }}>{rightSlot}</View>
        ) : timeLabel ? (
          <Text style={styles.time} numberOfLines={1}>
            {timeLabel}
          </Text>
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray100,
    padding: Layout.spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.backgroundMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  title: { ...Typography.body, color: Colors.textPrimary, fontWeight: "700" as const },
  subtitle: { ...Typography.caption, color: Colors.gray700, marginTop: 2 },
  time: { ...Typography.caption, color: Colors.gray600, marginLeft: 10 },
});

