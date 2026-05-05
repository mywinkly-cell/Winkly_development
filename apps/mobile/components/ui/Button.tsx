// apps/mobile/components/ui/Button.tsx
// Token-based Button: primary, secondary, ghost (spec v8.1)

import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  title: string;
  variant?: ButtonVariant;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function Button({ title, variant = "primary", onPress, loading, disabled, style, textStyle }: ButtonProps) {
  const handlePress = () => {
    if (disabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const variantStyles = getVariantStyles(variant, disabled);

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.base, variantStyles.container, style]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: variantStyles.textColor }, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

function getVariantStyles(variant: ButtonVariant, disabled?: boolean) {
  switch (variant) {
    case "primary":
      return {
        container: {
          backgroundColor: disabled ? Colors.gray300 : Colors.primaryViolet,
        } as ViewStyle,
        textColor: Colors.accentYellow,
      };
    case "secondary":
      return {
        container: {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: disabled ? Colors.gray300 : Colors.gray200,
        } as ViewStyle,
        textColor: disabled ? Colors.gray500 : Colors.primaryViolet,
      };
    case "ghost":
      return {
        container: {
          backgroundColor: "transparent",
        } as ViewStyle,
        textColor: disabled ? Colors.gray500 : Colors.primaryViolet,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    minHeight: Layout.touchTargetMin,
    paddingVertical: Layout.spacing.sm,
    paddingHorizontal: Layout.spacing.lg,
    borderRadius: Layout.radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...Typography.button,
  },
});
