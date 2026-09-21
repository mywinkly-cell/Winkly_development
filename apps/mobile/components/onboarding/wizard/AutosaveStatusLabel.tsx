// Tiny autosave indicator for the wizard header: "Saving…" / "Saved ✓" / "Couldn't save — retrying".
// Reserves its line height so the layout below never jumps when the text appears.

import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import type { AutosaveStatus } from "@/lib/profile/autosaveController";

const KEY: Record<Exclude<AutosaveStatus, "idle">, string> = {
  saving: "onboarding.autosave.saving",
  saved: "onboarding.autosave.saved",
  error: "onboarding.autosave.retrying",
};

export function AutosaveStatusLabel({ status }: { status: AutosaveStatus }) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <Text
      testID="autosave-status"
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      style={[
        theme.type.caption,
        {
          minHeight: theme.type.caption.lineHeight,
          textAlign: "right",
          marginBottom: theme.spacing.xs,
          fontFamily: theme.type.caption.fontFamily,
          color: status === "error" ? theme.colors.error : theme.colors.textMuted,
        },
      ]}
    >
      {status === "idle" ? "" : t(KEY[status])}
    </Text>
  );
}
