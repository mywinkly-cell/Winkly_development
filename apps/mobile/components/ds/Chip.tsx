// apps/mobile/components/ds/Chip.tsx
// Design-system primitive: selectable chip (filters, tags, multi-select options).

import React from "react";
import { Pressable, Text, type ViewStyle, type TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useAppTheme, type ModeName } from "@/constants/design-system";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Tint the selected state with a mode accent instead of the brand primary. */
  mode?: ModeName;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function Chip({ label, selected, onPress, mode, disabled, style, textStyle }: ChipProps) {
  const theme = useAppTheme();
  const accent = mode ? theme.modeAccent(mode).primary : theme.colors.primary;

  const handlePress = () => {
    if (disabled || !onPress) return;
    Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected: !!selected, disabled }}
      style={[
        {
          borderRadius: theme.radii.pill,
          maxWidth: "100%",
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          borderWidth: 1,
          backgroundColor: selected ? accent : theme.colors.surface,
          borderColor: selected ? accent : theme.colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          theme.type.caption,
          {
            fontFamily: theme.type.caption.fontFamily,
            color: selected ? theme.colors.onPrimary : theme.colors.textSecondary,
            fontWeight: selected ? "600" : "400",
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
