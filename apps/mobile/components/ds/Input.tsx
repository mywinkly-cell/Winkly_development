// apps/mobile/components/ds/Input.tsx
// Design-system primitive: labeled text input with error/helper state.

import React, { useState } from "react";
import { Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { useAppTheme } from "@/constants/design-system";

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
};

export function Input({ label, error, helperText, containerStyle, style, onFocus, onBlur, ...rest }: InputProps) {
  const theme = useAppTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.colors.error : focused ? theme.colors.primary : theme.colors.border;

  return (
    <View style={[{ marginBottom: theme.spacing.md }, containerStyle]}>
      {label ? (
        <Text
          style={[
            theme.type.caption,
            { color: theme.colors.textSecondary, marginBottom: theme.spacing.xxs, fontFamily: theme.type.caption.fontFamily },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          theme.type.body,
          {
            fontFamily: theme.type.body.fontFamily,
            borderWidth: 1,
            borderColor,
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            minHeight: 48,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[theme.type.caption, { color: theme.colors.error, marginTop: theme.spacing.xxs }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[theme.type.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.xxs }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
