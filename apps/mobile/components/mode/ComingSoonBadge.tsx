// ComingSoonBadge — small pill marking a mode that is visible but not live yet.

import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";

export function ComingSoonBadge({ style }: { style?: ViewStyle }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  return (
    <View
      style={[
        {
          alignSelf: "center",
          borderRadius: theme.radii.pill,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xxs,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[theme.type.overline, { color: theme.colors.textSecondary, fontFamily: theme.type.overline.fontFamily }]}
      >
        {t("modes.comingSoon")}
      </Text>
    </View>
  );
}
