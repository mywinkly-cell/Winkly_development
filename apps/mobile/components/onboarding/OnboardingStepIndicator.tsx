import React from "react";
import { View, Text } from "react-native";
import { useAppTheme } from "@/constants/design-system";

type Props = {
  currentStep: number;
  totalSteps: number;
  /** Label for the current step (e.g. "Photos & bio", "Romance — Goals"). */
  label: string;
  /** Optional fraction 0–1 for sub-progress within the current step (e.g. photo count). */
  subProgress?: number;
};

export function OnboardingStepIndicator({ currentStep, totalSteps, label, subProgress }: Props) {
  const theme = useAppTheme();
  const baseProgress = (currentStep - 1) / totalSteps;
  const stepSlice = 1 / totalSteps;
  const withinStep = subProgress != null ? Math.min(1, Math.max(0, subProgress)) * stepSlice : stepSlice;
  const fillPercent = Math.round((baseProgress + withinStep) * 100);

  return (
    <View style={{ marginBottom: theme.spacing.xl }}>
      <Text
        style={{
          ...theme.type.h3,
          fontFamily: theme.type.h3.fontFamily,
          color: theme.colors.primary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: theme.spacing.sm }}>
        <Text style={{ ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary }}>
          Step {currentStep} of {totalSteps}
        </Text>
        <Text style={{ ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textMuted }}>
          {Math.round((currentStep / totalSteps) * 100)}% complete
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
        <View
          style={{
            height: "100%",
            width: `${fillPercent}%`,
            backgroundColor: theme.colors.primary,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}
