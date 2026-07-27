/**
 * Weekly Spark section — the 3 verified plans at the top of the Planner.
 * CTA: View the plan → full details.
 */

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import { getDeviceCoordsIfPermitted } from "@/lib/location/deviceLocation";
import {
  distanceKm,
  markWeeklySparkSeen,
  type WeeklySpark,
  type WeeklySparkPlan,
  type SparkSlot,
} from "@/lib/ai/weeklySpark";
import { WeeklySparkCard } from "@/components/planner/WeeklySparkCard";

export type WeeklySparkSectionProps = {
  spark: WeeklySpark;
  locale?: string;
  onViewPlan: (plan: WeeklySparkPlan) => void;
  onSeen?: () => void;
  highlighted?: boolean;
};

const SLOT_ACCENT: Record<SparkSlot, string> = {
  solo: Colors.primaryViolet,
  date: Colors.romance.primary,
  meetup: Colors.friends.primary,
};

const SLOT_ORDER: Record<SparkSlot, number> = { solo: 0, date: 1, meetup: 2 };

export function WeeklySparkSection({
  spark,
  locale = "en",
  onViewPlan,
  onSeen,
  highlighted = false,
}: WeeklySparkSectionProps) {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (spark.seenAt) return;
    let cancelled = false;
    void markWeeklySparkSeen().then(() => {
      if (!cancelled) onSeen?.();
    });
    return () => { cancelled = true; };
  }, [spark.id, spark.seenAt, onSeen]);

  useEffect(() => {
    let cancelled = false;
    void getDeviceCoordsIfPermitted().then((coords) => {
      if (!cancelled) setOrigin(coords);
    });
    return () => { cancelled = true; };
  }, []);

  if (spark.plans.length === 0) return null;

  const plans = [...spark.plans].sort(
    (a, b) => (SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) || a.rank - b.rank,
  );

  return (
    <View style={[styles.section, highlighted && styles.sectionHighlighted]}>
      <View style={styles.header}>
        <SparklesIcon size={18} color={Colors.primaryViolet} />
        <Text style={styles.headerText}>{t("weeklySpark.sectionTitle")}</Text>
      </View>

      {plans.map((plan) => {
        const dist =
          origin && plan.placeLat !== null && plan.placeLng !== null
            ? distanceKm(origin.latitude, origin.longitude, plan.placeLat, plan.placeLng)
            : null;
        return (
          <WeeklySparkCard
            key={plan.id}
            plan={plan}
            accentColor={SLOT_ACCENT[plan.slot]}
            distanceKm={dist}
            locale={locale}
            onViewPlan={onViewPlan}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  sectionHighlighted: {
    borderRadius: 18,
    padding: 8,
    margin: -8,
    marginBottom: 0,
    borderWidth: 1.5,
    borderColor: Colors.primaryViolet,
    shadowColor: Colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  headerText: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
});
