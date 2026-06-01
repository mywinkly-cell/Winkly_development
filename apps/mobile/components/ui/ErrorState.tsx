// apps/mobile/components/ui/ErrorState.tsx
// Reusable error placeholder with a retry action. Pair with useAsyncData so a
// failed fetch always offers recovery instead of an indefinite spinner.

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { Colors, Layout, Typography, FontFamily } from "@/constants/tokens";
import { Button } from "./Button";

type ErrorStateProps = {
  /** True when the failure was caused by being offline (uses a tailored message). */
  isOffline?: boolean;
  /** Optional override for the message text. */
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
};

export function ErrorState({ isOffline, message, onRetry, style }: ErrorStateProps) {
  const { t } = useTranslation();

  const title = isOffline
    ? t("errorState.offlineTitle", "You're offline")
    : t("errorState.title", "Something went wrong");

  const body =
    message ??
    (isOffline
      ? t("errorState.offlineBody", "Check your connection and try again.")
      : t("errorState.body", "We couldn't load this right now."));

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {onRetry ? (
        <Button
          title={t("errorState.retry", "Try again")}
          variant="primary"
          onPress={onRetry}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Layout.spacing.xxl,
    gap: Layout.spacing.sm,
  },
  title: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  body: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  button: {
    marginTop: Layout.spacing.md,
    minWidth: 160,
  },
});
