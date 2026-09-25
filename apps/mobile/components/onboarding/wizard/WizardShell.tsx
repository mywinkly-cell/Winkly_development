// Shell for the onboarding wizard steps: progress indicator, scrollable body,
// and a persistent Back/Next footer. Built from the D0 primitives (Button).

import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { Button } from "@/components/ui/Button";
import { OnboardingStepIndicator } from "@/components/onboarding/OnboardingStepIndicator";
import { AutosaveStatusLabel } from "@/components/onboarding/wizard/AutosaveStatusLabel";
import type { AutosaveStatus } from "@/lib/profile/autosaveController";

export function WizardShell(props: {
  currentStep: number; // 1-based
  totalSteps: number;
  stepLabel: string;
  subProgress?: number;
  children: React.ReactNode;
  onBack: () => void;
  backDisabled?: boolean;
  onNext: () => void;
  nextLabel: string;
  saving?: boolean;
  saveError?: string | null;
  onRetry?: () => void;
  /** Background autosave state, shown as a tiny label above the step indicator. */
  autosaveStatus?: AutosaveStatus;
  showSkip?: boolean;
  onSkip?: () => void;
}) {
  const {
    currentStep, totalSteps, stepLabel, subProgress, children,
    onBack, backDisabled, onNext, nextLabel, saving, saveError, onRetry,
    autosaveStatus, showSkip, onSkip,
  } = props;
  const { t } = useTranslation();

  return (
    <View>
      {autosaveStatus ? <AutosaveStatusLabel status={autosaveStatus} /> : null}
      <OnboardingStepIndicator currentStep={currentStep} totalSteps={totalSteps} label={stepLabel} subProgress={subProgress} />

      {children}

      {saveError ? (
        <View style={{ backgroundColor: "#FDECEC", borderRadius: 14, padding: 14, marginTop: 20, borderWidth: 1, borderColor: "#F5B5B5" }}>
          <Text style={{ ...Typography.body, color: "#B42318", fontWeight: "600" as const }}>{t("onboarding.wizard.saveFailedTitle")}</Text>
          <Text style={{ ...Typography.caption, color: "#B42318", marginTop: 4 }}>{saveError}</Text>
          {onRetry && (
            <Button title={saving ? t("onboarding.wizard.retrying") : t("onboarding.wizard.tapToRetry")} variant="ghost" onPress={onRetry} disabled={saving} style={{ alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 0 }} />
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", marginTop: 28, gap: Layout.spacing.md }}>
        {currentStep > 1 && (
          <Button title={t("common.back")} variant="secondary" onPress={onBack} disabled={backDisabled || saving} style={{ flex: 1 }} />
        )}
        <Button title={saving ? t("onboarding.autosave.saving") : nextLabel} variant="primary" onPress={onNext} disabled={saving} style={{ flex: currentStep > 1 ? 2 : 1 }} />
      </View>

      {showSkip && onSkip && (
        <Button title={t("onboarding.wizard.skipForNow")} variant="ghost" onPress={onSkip} disabled={saving} style={{ marginTop: 12 }} textStyle={{ color: Colors.gray600 }} />
      )}
    </View>
  );
}
