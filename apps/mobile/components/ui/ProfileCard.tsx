// apps/mobile/components/ui/ProfileCard.tsx
// Core reusable profile card (avatar + primary/secondary text + optional chips).

import React from "react";
import { View, Text, StyleSheet, ViewStyle, Pressable } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { Avatar } from "@/components/ui/Avatar";

export type ProfileCardProps = {
  name: string;
  subtitle?: string;
  avatarUri?: string | null;
  initials?: string;
  rightSlot?: React.ReactNode;
  chips?: string[];
  style?: ViewStyle;
  onPress?: () => void;
};

export function ProfileCard({ name, subtitle, avatarUri, initials, rightSlot, chips, style, onPress }: ProfileCardProps) {
  const Container: React.ElementType = onPress ? Pressable : View;
  const containerProps = onPress ? { onPress, style: [styles.card, style] } : { style: [styles.card, style] };

  return (
    <Container {...(containerProps as any)} accessibilityRole={onPress ? "button" : undefined}>
      <View style={styles.row}>
        <Avatar uri={avatarUri ?? undefined} initials={initials ?? name} size={52} />
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>

      {chips?.length ? (
        <View style={styles.chipsRow}>
          {chips.slice(0, 6).map((c, idx) => (
            <View key={`${c}-${idx}`} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {c}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
  textCol: { flex: 1 },
  name: { ...Typography.h3, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.gray700, marginTop: 2 },
  rightSlot: { marginLeft: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.backgroundMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { ...Typography.caption, color: Colors.gray700 },
});

