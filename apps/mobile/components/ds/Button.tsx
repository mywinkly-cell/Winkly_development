// apps/mobile/components/ds/Button.tsx
// Design-system primitives: PrimaryButton, SecondaryButton (+ shared TextButton for tertiary actions).

import React from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle, type TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

type BaseButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
};

function useHapticPress(onPress: () => void, disabled?: boolean) {
  return () => {
    if (disabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
}

function buttonBaseStyle(theme: AppTheme): ViewStyle {
  return {
    minHeight: 48,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
  };
}

export function PrimaryButton({ title, onPress, loading, disabled, icon, style, textStyle, accessibilityLabel }: BaseButtonProps) {
  const theme = useAppTheme();
  const handlePress = useHapticPress(onPress, disabled || loading);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        buttonBaseStyle(theme),
        {
          backgroundColor: disabled ? theme.colors.border : pressed ? theme.colors.primaryPressed : theme.colors.primary,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onPrimary} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              theme.type.button,
              { color: disabled ? theme.colors.textMuted : theme.colors.onPrimary, fontFamily: theme.type.button.fontFamily },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, loading, disabled, icon, style, textStyle, accessibilityLabel }: BaseButtonProps) {
  const theme = useAppTheme();
  const handlePress = useHapticPress(onPress, disabled || loading);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        buttonBaseStyle(theme),
        {
          backgroundColor: pressed ? theme.colors.backgroundMuted : "transparent",
          borderWidth: 1,
          borderColor: disabled ? theme.colors.border : theme.colors.primary,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              theme.type.button,
              { color: disabled ? theme.colors.textMuted : theme.colors.primary, fontFamily: theme.type.button.fontFamily },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Tertiary/ghost action — no border, no fill. Use sparingly (e.g. "Skip", "Cancel"). */
export function TextButton({ title, onPress, loading, disabled, icon, style, textStyle, accessibilityLabel }: BaseButtonProps) {
  const theme = useAppTheme();
  const handlePress = useHapticPress(onPress, disabled || loading);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} size="small" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}>
          {icon}
          <Text
            style={[
              theme.type.bodyMedium,
              { color: disabled ? theme.colors.textMuted : theme.colors.primary, fontFamily: theme.type.bodyMedium.fontFamily },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
