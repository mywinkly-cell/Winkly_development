// apps/mobile/components/ds/Header.tsx
// Design-system primitive: generic in-screen top header bar (back, title, actions).
// For screens that use expo-router's native Stack header instead, keep using
// lib/navigation/screenOptions — this is for custom in-screen headers only.

import React from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAppTheme } from "@/constants/design-system";

type HeaderProps = {
  title?: string;
  /** Show a back chevron that pops the current route. Pass a function to override the action. */
  onBack?: (() => void) | true;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: ViewStyle;
};

export function Header({ title, onBack, leading, trailing, style }: HeaderProps) {
  const theme = useAppTheme();
  const router = useRouter();

  const handleBack = () => {
    Haptics.selectionAsync();
    if (typeof onBack === "function") onBack();
    else router.back();
  };

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 56,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minWidth: 44 }}>
        {onBack ? (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radii.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.backgroundMuted,
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        ) : (
          leading
        )}
      </View>

      {title ? (
        <Text
          numberOfLines={1}
          style={[
            theme.type.h3,
            { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily, flex: 1, textAlign: "center" },
          ]}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minWidth: 44, justifyContent: "flex-end" }}>
        {trailing}
      </View>
    </View>
  );
}
