import React from "react";
import { View, Text } from "react-native";
import { Colors, Typography, FontFamily } from "@/constants/tokens";
import { ONBOARDING_STEP_LABELS } from "@/lib/profile/onboardingSteps";

type Props = {
  currentStep: number;
  totalSteps: number;
  /** Optional fraction 0–1 for sub-progress within the current step (e.g. photo count). */
  subProgress?: number;
};

export function OnboardingStepIndicator({ currentStep, totalSteps, subProgress }: Props) {
  const baseProgress = (currentStep - 1) / totalSteps;
  const stepSlice = 1 / totalSteps;
  const withinStep = subProgress != null ? Math.min(1, Math.max(0, subProgress)) * stepSlice : stepSlice;
  const fillPercent = Math.round((baseProgress + withinStep) * 100);
  const stepLabel = ONBOARDING_STEP_LABELS[currentStep - 1] ?? `Step ${currentStep}`;

  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          ...Typography.h3,
          fontFamily: FontFamily.headingBold,
          color: Colors.primaryViolet,
          marginBottom: 8,
        }}
      >
        {stepLabel}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ ...Typography.body, color: Colors.gray700 }}>
          Step {currentStep} of {totalSteps}
        </Text>
        <Text style={{ ...Typography.caption, color: Colors.gray500 }}>
          {Math.round((currentStep / totalSteps) * 100)}% complete
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: Colors.gray200, overflow: "hidden" }}>
        <View
          style={{
            height: "100%",
            width: `${fillPercent}%`,
            backgroundColor: Colors.primaryViolet,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}
