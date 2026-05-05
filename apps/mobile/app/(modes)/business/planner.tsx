// Business Planner — Same look/overview/functionality as main Planner; initial tab = Business

import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import PlannerIndex, { type PlannerIndexHandle } from "@/app/planner";
import { Colors } from "@/constants/tokens";

export default function BusinessPlanner() {
  const plannerRef = useRef<PlannerIndexHandle>(null);
  return (
    <SafeScreenView edges={["left", "right"]} style={styles.screen}>
      <PlannerHeader onFilterPress={() => plannerRef.current?.openFilter()} onAIPress={() => plannerRef.current?.openConcierge()} />
      <View style={styles.content}>
        <PlannerIndex ref={plannerRef} embedded initialTab="business" />
      </View>
      <ModeBottomBar mode="business" />
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { flex: 1 },
});
