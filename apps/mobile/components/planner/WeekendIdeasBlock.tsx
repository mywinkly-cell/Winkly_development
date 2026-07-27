/**
 * Weekly Spark block — three plan cards for this week (mode-aware). Always shows cards
 * (no weekend-only teaser). Distinct from the open-ended "Ask Winkly AI" promo below.
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import { getDeviceCoordsIfPermitted } from "@/lib/location/deviceLocation";
import { distanceKm, markWeeklySparkSeen, type WeeklySparkPlan, type SparkSlot } from "@/lib/ai/weeklySpark";
import type { WeeklySparkContext } from "@/lib/ai/weekendIdeasPlans";
import { WeeklySparkCard } from "@/components/planner/WeeklySparkCard";

export type WeekendIdeasBlockProps = {
  title?: string;
  plans: WeeklySparkPlan[];
  loadingPlans: boolean;
  loadError?: boolean;
  locale?: string;
  sparkContext?: WeeklySparkContext;
  onRetryLoad?: () => void;
  onDismiss: () => void;
  onViewPlan: (plan: WeeklySparkPlan) => void;
  highlighted?: boolean;
  showDismiss?: boolean;
};

const SLOT_ACCENT: Record<SparkSlot, string> = {
  solo: Colors.primaryViolet,
  date: Colors.romance.primary,
  meetup: Colors.friends.primary,
};

const CONTEXT_ACCENT: Partial<Record<WeeklySparkContext, string>> = {
  romance: Colors.romance.primary,
  friends: Colors.friends.primary,
  business: Colors.business.primary,
  events: Colors.events.primary,
};

const SLOT_ORDER: Record<SparkSlot, number> = { solo: 0, date: 1, meetup: 2 };

export function WeekendIdeasBlock({
  title,
  plans,
  loadingPlans,
  loadError = false,
  locale = "en",
  sparkContext = "all",
  onRetryLoad,
  onDismiss,
  onViewPlan,
  highlighted = false,
  showDismiss = true,
}: WeekendIdeasBlockProps) {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    void markWeeklySparkSeen();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDeviceCoordsIfPermitted().then((coords) => {
      if (!cancelled) setOrigin(coords);
    });
    return () => { cancelled = true; };
  }, []);

  const sortedPlans = [...plans].sort(
    (a, b) => (SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) || a.rank - b.rank,
  );

  const modeAccent = CONTEXT_ACCENT[sparkContext];

  return (
    <View style={[styles.wrap, highlighted && styles.wrapHighlighted]}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <SparklesIcon size={18} color={Colors.primaryViolet} />
            <Text style={styles.badgeText}>{title ?? t("weeklySpark.sectionTitle")}</Text>
          </View>
          {showDismiss ? (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); onDismiss(); }}
              hitSlop={12}
              style={styles.dismissBtn}
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={22} color={Colors.gray500} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.expanded}>
          {loadingPlans ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.primaryViolet} />
              <Text style={styles.loadingText}>{t("weeklyWeekend.loading")}</Text>
            </View>
          ) : loadError || sortedPlans.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t("weeklyWeekend.empty")}</Text>
              {onRetryLoad ? (
                <TouchableOpacity style={styles.retryBtn} onPress={() => { Haptics.selectionAsync(); onRetryLoad(); }}>
                  <Text style={styles.retryText}>{t("common.tryAgain")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            sortedPlans.map((plan) => {
              const dist =
                origin && plan.placeLat != null && plan.placeLng != null
                  ? distanceKm(origin.latitude, origin.longitude, plan.placeLat, plan.placeLng)
                  : null;
              return (
                <WeeklySparkCard
                  key={plan.id}
                  plan={plan}
                  accentColor={modeAccent ?? SLOT_ACCENT[plan.slot]}
                  distanceKm={dist}
                  locale={locale}
                  onViewPlan={onViewPlan}
                />
              );
            })
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  wrapHighlighted: {
    borderRadius: 18,
    padding: 8,
    margin: -8,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.primaryViolet,
    shadowColor: Colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryViolet,
    borderColor: Colors.gray200,
    borderWidth: 1,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.primaryViolet + "18",
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.primaryViolet,
  },
  dismissBtn: { padding: 4 },
  expanded: { marginTop: 4 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 24,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.gray600,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
  },
  retryText: {
    ...Typography.button,
    color: Colors.primaryViolet,
  },
});
