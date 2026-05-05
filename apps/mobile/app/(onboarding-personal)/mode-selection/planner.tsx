// ────────────────────────────────────────────────
// Mode-selection Planner — Planner with ModeSelection chrome
// All tab first; same content as main planner
// ────────────────────────────────────────────────

import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { ModeSelectionBottomBar } from "@/components/layout/ModeSelectionBottomBar";
import PlannerIndex, { type PlannerIndexHandle } from "@/app/planner";
import { Colors } from "@/constants/tokens";

export default function ModeSelectionPlanner() {
  const plannerRef = useRef<PlannerIndexHandle>(null);
  return (
    <SafeScreenView edges={["left", "right"]} style={styles.screen}>
      <PlannerHeader onFilterPress={() => plannerRef.current?.openFilter()} />
      <View style={styles.content}>
        <PlannerIndex ref={plannerRef} embedded />
      </View>
      <ModeSelectionBottomBar />
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { flex: 1 },
});
