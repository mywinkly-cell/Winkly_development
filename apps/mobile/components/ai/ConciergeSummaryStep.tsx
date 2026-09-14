/**
 * Step 4 — Plan Summary: show summary card and "Plan" button.
 * Confirms intent before running AI generation.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Card, PrimaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import type { ActivityDetails } from "@/lib/ai/conciergePlanningFlow";
import { useNormalizedLocation } from "@/lib/location/useLocationDisplay";

function dayKey(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type ConciergeSummaryStepProps = {
  activityLabel: string | null;
  details: Partial<ActivityDetails>;
  whoLabel?: string; // e.g. "2 people", "Just me"
  onGenerate: () => void;
  onBack: () => void;
  loading?: boolean;
  showInlineBack?: boolean;
};

export function ConciergeSummaryStep({
  activityLabel,
  details,
  whoLabel,
  onGenerate,
  onBack,
  loading = false,
  showInlineBack = true,
}: ConciergeSummaryStepProps) {
  const theme = useAppTheme();
  const locationDisplay = useNormalizedLocation(details.location);
  const dateStr =
    details.date && details.singleDay === false && details.dateEnd && !sameCalendarDay(details.date, details.dateEnd)
      ? `${dayKey(details.date)} → ${dayKey(details.dateEnd)}`
      : details.date
        ? dayKey(details.date)
        : "";
  const timeLabel =
    details.exactTimeHm && /^\d{2}:\d{2}$/.test(details.exactTimeHm)
      ? details.exactTimeHm
      : details.timeOfDay === "any"
        ? ""
        : details.timeOfDay === "morning"
          ? "Morning"
          : details.timeOfDay === "lunch"
            ? "Lunch"
            : details.timeOfDay === "afternoon"
              ? "Afternoon"
              : details.timeOfDay === "evening"
                ? "Evening"
                : "";
  const budgetStr =
    details.budgetAmount && details.budgetCurrency
      ? `${details.budgetCurrency} ${details.budgetAmount}`
      : details.budgetCurrency
        ? details.budgetCurrency
        : "";

  const rowStyle = { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.md, marginBottom: theme.spacing.md };
  const rowTextStyle = [theme.type.body, { color: theme.colors.textPrimary, fontFamily: theme.type.body.fontFamily, flex: 1 }];

  return (
    <View style={{ flex: 1, paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl }}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.primary} />
          <Text style={[theme.type.caption, { color: theme.colors.primary, fontFamily: theme.type.caption.fontFamily, fontWeight: "600" }]}>
            Back
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily, marginBottom: theme.spacing.sm }]}>
        Plan summary
      </Text>
      <Text
        style={[
          theme.type.caption,
          { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.xxl },
        ]}
      >
        Confirm and generate your plans
      </Text>

      <Card elevation={1} padding="lg" style={{ marginBottom: theme.spacing.xxl }}>
        {dateStr ? (
          <View style={rowStyle}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={rowTextStyle}>
              {dateStr}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
          </View>
        ) : null}
        {locationDisplay ? (
          <View style={rowStyle}>
            <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={rowTextStyle} numberOfLines={1}>{locationDisplay}</Text>
          </View>
        ) : null}
        {budgetStr ? (
          <View style={rowStyle}>
            <Ionicons name="wallet-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={rowTextStyle}>Budget {budgetStr}</Text>
          </View>
        ) : null}
        {details.cuisine ? (
          <View style={rowStyle}>
            <Ionicons name="restaurant-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={rowTextStyle}>{details.cuisine} cuisine</Text>
          </View>
        ) : null}
        {whoLabel ? (
          <View style={rowStyle}>
            <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={rowTextStyle}>{whoLabel}</Text>
          </View>
        ) : null}
        {activityLabel ? (
          <View style={[rowStyle, { marginBottom: 0 }]}>
            <SparklesIcon size={20} color={theme.colors.primary} />
            <Text style={[...rowTextStyle, { fontWeight: "600", color: theme.colors.primary }]}>{activityLabel}</Text>
          </View>
        ) : null}
      </Card>

      <PrimaryButton title="Plan" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onGenerate(); }} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
});
