// apps/mobile/components/ds/SectionHeader.tsx
// Design-system primitive: in-screen section title, optional subtitle + trailing action.

import React from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { useAppTheme } from "@/constants/design-system";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
};

export function SectionHeader({ title, subtitle, actionLabel, onActionPress, style }: SectionHeaderProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: theme.spacing.md },
        style,
      ]}
    >
      <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
        <Text style={[theme.type.h3, { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              theme.type.body,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs, fontFamily: theme.type.body.fontFamily },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
        >
          <Text
            style={[
              theme.type.bodyMedium,
              { color: theme.colors.primary, fontFamily: theme.type.bodyMedium.fontFamily },
            ]}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
