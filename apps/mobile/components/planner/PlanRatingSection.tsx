/**
 * Renders rating prompts for the user's plans that have already happened.
 *
 * Self-contained: fetches its own data and renders nothing at all when there's
 * nothing to rate, so it can be dropped into the planner with a single line and
 * never costs layout when idle.
 *
 * Shows at most two at a time — a wall of rating prompts is how you get people
 * to ignore all of them.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Colors, Typography } from "@/constants/tokens";
import { PlanRatingPrompt } from "@/components/planner/PlanRatingPrompt";
import { listPlansAwaitingRating, type SharedPlan } from "@/lib/ai/sharedPlans";

export type PlanRatingSectionProps = {
  /** Bump to force a refetch (e.g. after the planner reloads). */
  refreshKey?: number;
  maxVisible?: number;
};

export function PlanRatingSection({ refreshKey = 0, maxVisible = 2 }: PlanRatingSectionProps) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<SharedPlan[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setPlans(await listPlansAwaitingRating(5));
    } catch {
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = plans.filter((p) => !dismissed.has(p.id)).slice(0, maxVisible);
  if (visible.length === 0) return null;

  const handleDone = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t("concierge.feedback.title")}</Text>
      {visible.map((plan) => (
        <PlanRatingPrompt
          key={plan.id}
          plan={plan}
          onDone={() => handleDone(plan.id)}
          onDismiss={() => handleDone(plan.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    gap: 4,
  },
  heading: {
    ...Typography.sectionTitle,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
});
