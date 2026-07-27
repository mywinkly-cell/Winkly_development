/**
 * Highly-rated plans other people actually ran, shown alongside AI options for
 * the same city and theme.
 *
 * Self-contained and silent when empty — which it will be at first, since a plan
 * only becomes eligible once someone has run AND rated it. That cold start is
 * expected, not a bug: the section simply appears once there's real experience
 * behind it.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Typography } from "@/constants/tokens";
import { CommunityPlanCard } from "@/components/ai/CommunityPlanCard";
import { getTopCommunityPlans, type CommunityPlan } from "@/lib/ai/sharedPlans";
import type { AppMode } from "@/types/database";

export type CommunityPlansSectionProps = {
  city?: string;
  mode: AppMode;
  theme?: string;
  numDays?: number;
  limit?: number;
  /** Called when the user picks a community plan instead of an AI option. */
  onUsePlan?: (plan: CommunityPlan) => void;
};

export function CommunityPlansSection({
  city,
  mode,
  theme,
  numDays = 1,
  limit = 2,
  onUsePlan,
}: CommunityPlansSectionProps) {
  const [plans, setPlans] = useState<CommunityPlan[]>([]);

  const load = useCallback(async () => {
    if (!city) {
      setPlans([]);
      return;
    }
    try {
      setPlans(await getTopCommunityPlans({ city, mode, theme, numDays, limit }));
    } catch {
      setPlans([]);
    }
  }, [city, mode, theme, numDays, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (plans.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Plans people actually did</Text>
      <Text style={styles.sub}>
        Rated by Winkly members who ran them{city ? ` in ${city}` : ""}.
      </Text>
      {plans.map((plan) => (
        <CommunityPlanCard key={plan.id} plan={plan} onUse={onUsePlan} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 12,
    gap: 2,
  },
  heading: {
    ...Typography.sectionTitle,
    color: Colors.textPrimary,
  },
  sub: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 4,
  },
});
