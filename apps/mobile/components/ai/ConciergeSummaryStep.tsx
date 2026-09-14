/**
 * Step 4 — Plan Summary: show summary card and "Plan" button.
 * Confirms intent before running AI generation.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, PrimaryButton, TextButton } from "@/components/ds";
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
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

  return (
    <View style={styles.wrap}>
      {showInlineBack ? (
        <TextButton
          title="Back"
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <Text style={styles.title}>Plan summary</Text>
      <Text style={styles.subtitle}>Confirm and generate your plans</Text>

      <Card style={styles.card} elevation={1}>
        {dateStr ? (
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>
              {dateStr}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
          </View>
        ) : null}
        {locationDisplay ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText} numberOfLines={1}>{locationDisplay}</Text>
          </View>
        ) : null}
        {budgetStr ? (
          <View style={styles.row}>
            <Ionicons name="wallet-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>Budget {budgetStr}</Text>
          </View>
        ) : null}
        {details.cuisine ? (
          <View style={styles.row}>
            <Ionicons name="restaurant-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>{details.cuisine} cuisine</Text>
          </View>
        ) : null}
        {whoLabel ? (
          <View style={styles.row}>
            <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>{whoLabel}</Text>
          </View>
        ) : null}
        {activityLabel ? (
          <View style={[styles.row, styles.rowLast]}>
            <SparklesIcon size={20} color={theme.colors.primary} />
            <Text style={[styles.cardText, styles.activityText]}>{activityLabel}</Text>
          </View>
        ) : null}
      </Card>

      <PrimaryButton title="Plan" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onGenerate(); }} loading={loading} />
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.lg, paddingLeft: 0 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    subtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxl },
    card: {
      marginBottom: theme.spacing.xxl,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    rowLast: { marginBottom: 0 },
    cardText: { ...theme.type.body, color: theme.colors.textPrimary, flex: 1 },
    activityText: { fontWeight: "600", color: theme.colors.primary },
  });
}
