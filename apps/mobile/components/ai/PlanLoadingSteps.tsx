// apps/mobile/components/ai/PlanLoadingSteps.tsx
// Loading overlay for plan generation. Shows only the steps that have really started for this
// request (see lib/ai/planLoadingSteps) — no rotating copy, no timers.

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import type { PlanLoadingStep } from "@/lib/ai/planLoadingSteps";

const STEP_ICON_SIZE = 16;
const OVERLAY_FADE_MS = 220;
const CARD_MAX_WIDTH = 320;

export function PlanLoadingSteps({ steps }: { steps: PlanLoadingStep[] }) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeIn.duration(OVERLAY_FADE_MS)}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: theme.colors.overlay,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing.xxl,
        },
      ]}
    >
      <View
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        style={[
          {
            width: "100%",
            maxWidth: CARD_MAX_WIDTH,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            paddingVertical: theme.spacing.xl,
            paddingHorizontal: theme.spacing.lg,
            gap: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
          },
          theme.elevation(3),
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[theme.type.h3, { color: theme.colors.textPrimary }]}>{t("planLoading.title")}</Text>
        </View>
        {steps.map((step) => (
          <Animated.View
            key={step.id}
            entering={FadeIn.duration(OVERLAY_FADE_MS)}
            style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}
          >
            <Ionicons
              name={step.status === "done" ? "checkmark-circle" : "ellipse-outline"}
              size={STEP_ICON_SIZE}
              color={step.status === "done" ? theme.colors.success : theme.colors.textMuted}
            />
            <Text
              style={[
                theme.type.caption,
                { color: step.status === "done" ? theme.colors.textSecondary : theme.colors.textPrimary, flex: 1 },
              ]}
            >
              {t(step.labelKey, step.labelParams)}
            </Text>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}
