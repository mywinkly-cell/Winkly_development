/**
 * Confirm a pre-built Weekly Spark / weekend-ideas plan — add to planner or invite,
 * without restarting the full concierge planning wizard.
 */

import React from "react";
import { Modal, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { ConciergeConfirmStep } from "@/components/ai/ConciergeConfirmStep";
import {
  sparkPlanToStructured,
  modeForSparkSlot,
  dateForSparkPlan,
} from "@/lib/ai/weekendIdeasPlans";
import type { WeeklySparkPlan } from "@/lib/ai/weeklySpark";

export type SparkPlanConfirmModalProps = {
  visible: boolean;
  plan: WeeklySparkPlan | null;
  locationLineDisplay?: string;
  onClose: () => void;
};

export function SparkPlanConfirmModal({
  visible,
  plan,
  locationLineDisplay,
  onClose,
}: SparkPlanConfirmModalProps) {
  const insets = useSafeAreaInsets();
  if (!plan) return null;

  const mode = modeForSparkSlot(plan.slot);
  const dateForPlan = dateForSparkPlan(plan);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        <ConciergeConfirmStep
          structuredPlan={sparkPlanToStructured(plan)}
          partner={null}
          dateForPlan={dateForPlan}
          locationLineDisplay={locationLineDisplay}
          mode={mode}
          onDone={onClose}
          onBack={onClose}
          showInlineBack
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: "#fff" },
});
