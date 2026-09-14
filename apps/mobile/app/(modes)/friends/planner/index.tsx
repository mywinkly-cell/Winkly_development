import React, { useRef, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import PlannerIndex, { type PlannerIndexHandle } from "@/app/(tabs)/planner";
import { useAppTheme } from "@/constants/design-system";

export default function FriendsPlanner() {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { flex: 1 },
  });
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
          initialTab="meetups"
          onWeeklySparkVisibilityChange={setSparkActive}
        />
      </View>
      <FriendsBottomNav />
    </SafeScreenView>
  );
}
