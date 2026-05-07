// apps/mobile/components/ui/ModeCard.tsx
// Card used for selecting a mode (friends/business/romance/events).

import React from "react";
import { View, Text, Pressable, Image, ImageSourcePropType, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type ModeCardProps = {
  label: string;
  description: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconImage?: ImageSourcePropType;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export function ModeCard({ label, description, color, icon, iconImage, active, onPress, style }: ModeCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, active ? { borderColor: color, backgroundColor: `${color}10` } : null, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
          {iconImage ? (
            <Image source={iconImage} style={{ width: 28, height: 28 }} resizeMode="contain" />
          ) : icon ? (
            <Ionicons name={icon} size={26} color={color} />
          ) : (
            <Ionicons name="star" size={26} color={color} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.subtitle}>{description}</Text>
        </View>

        <Ionicons name={active ? "checkmark-circle" : "chevron-forward"} size={22} color={active ? color : Colors.gray600} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: Layout.spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { ...Typography.h3, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.gray700, marginTop: 2 },
});

