// apps/mobile/components/ui/InputField.tsx
// Token-based InputField (spec v8.1)

import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";

interface InputFieldProps {
  label?: string;
  error?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  [key: string]: unknown;
}

export function InputField(props: InputFieldProps) {
  const { label, error, value, onChangeText, placeholder, secureTextEntry, ...rest } = props;
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray500}
        secureTextEntry={secureTextEntry}
        style={[styles.input, error ? styles.inputError : null]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Layout.spacing.md,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.backgroundLight,
    borderRadius: Layout.radii.control,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.md,
    minHeight: Layout.touchTargetMin,
    color: Colors.textPrimary,
    ...Typography.body,
  },
  inputError: {
    borderColor: Colors.errorRed,
  },
  error: {
    ...Typography.caption,
    color: Colors.errorRed,
    marginTop: Layout.spacing.xs,
  },
});
