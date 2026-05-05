// Romance Planner — Same look/overview/functionality as main Planner; initial tab = Dates

import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import PlannerIndex, { type PlannerIndexHandle } from "@/app/planner";
import { Colors } from "@/constants/tokens";

export default function RomancePlanner() {
  const plannerRef = useRef<PlannerIndexHandle>(null);
  return (
    <SafeScreenView edges={["left", "right"]} style={styles.screen}>
      <PlannerHeader onFilterPress={() => plannerRef.current?.openFilter()} />
      <View style={styles.content}>
        <PlannerIndex ref={plannerRef} embedded initialTab="dates" />
      </View>
      <RomanceBottomNav />
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { flex: 1 },
});
