import React, { useRef, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import PlannerIndex, { type PlannerIndexHandle } from "@/app/(tabs)/planner";
import { Colors } from "@/constants/tokens";

export default function RomancePlanner() {
  const plannerRef = useRef<PlannerIndexHandle>(null);
  const [sparkActive, setSparkActive] = useState(false);
  const onWeeklySparkPress = useCallback(() => {
    if (sparkActive) plannerRef.current?.hideWeeklySparks();
    else plannerRef.current?.openWeeklySparks();
  }, [sparkActive]);

  return (
    <SafeScreenView edges={["left", "right"]} style={styles.screen}>
      <PlannerHeader
        onFilterPress={() => plannerRef.current?.openFilter()}
        onWeeklySparkPress={onWeeklySparkPress}
        weeklySparkActive={sparkActive}
        onAIPress={() => plannerRef.current?.openConcierge()}
      />
      <View style={styles.content}>
        <PlannerIndex
          ref={plannerRef}
          embedded
          initialTab="dates"
          onWeeklySparkVisibilityChange={setSparkActive}
        />
      </View>
      <RomanceBottomNav />
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { flex: 1 },
});
