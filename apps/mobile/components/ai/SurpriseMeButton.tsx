// "Surprise me ✨" — one tap, zero input, three plans. The button sits in the empty Planner;
// PlanItBar shows the same action as its first chip (via useOpenSurprise).

import React, { useCallback } from "react";
import type { ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SecondaryButton } from "@/components/ds";
import type { Mode } from "@/types";

/** Opens the concierge straight into the Surprise me results. */
export function useOpenSurprise(mode: Mode | "all") {
  const router = useRouter();
  return useCallback(() => {
    router.push({ pathname: "/concierge", params: { source_screen: "planner", mode, surprise: "1" } });
  }, [router, mode]);
}

export function SurpriseMeButton({
  onPress,
  disabled,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { t } = useTranslation();
  return (
    <SecondaryButton
      title={t("surprise.cta")}
      onPress={onPress}
      disabled={disabled}
      style={style}
      accessibilityLabel={t("surprise.ctaA11y")}
    />
  );
}
