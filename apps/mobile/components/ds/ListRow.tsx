// apps/mobile/components/ds/ListRow.tsx
// Design-system primitive: single row in a settings/list screen — leading
// element, title/subtitle, trailing accessory, optional chevron.

import React from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/constants/design-system";

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Show a trailing chevron. Ignored if `trailing` is provided. Default true when onPress is set. */
  showChevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  style?: ViewStyle;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  showChevron,
  onPress,
  disabled,
  destructive,
  style,
}: ListRowProps) {
  const theme = useAppTheme();
  const chevron = showChevron ?? Boolean(onPress);
  const titleColor = destructive ? theme.colors.error : theme.colors.textPrimary;

  const content = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          minHeight: 56,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.md,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[theme.type.bodyMedium, { color: titleColor, fontFamily: theme.type.bodyMedium.fontFamily }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[
              theme.type.caption,
              { color: theme.colors.textSecondary, marginTop: 2, fontFamily: theme.type.caption.fontFamily },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {!trailing && chevron ? (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.backgroundMuted : "transparent" })}
    >
      {content}
    </Pressable>
  );
}
