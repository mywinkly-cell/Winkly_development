/**
 * Step 4 — Plan Summary: show summary card and "Generate plans" button.
 * Confirms intent before running AI generation.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography, Layout } from "@/constants/tokens";
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
  const locationDisplay = useNormalizedLocation(details.location);
  const dateStr =
    details.date && details.singleDay === false && details.dateEnd && !sameCalendarDay(details.date, details.dateEnd)
      ? `${dayKey(details.date)} → ${dayKey(details.dateEnd)}`
      : details.date
        ? dayKey(details.date)
        : "";
  const timeLabel =
    details.timeOfDay === "any"
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
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>Plan summary</Text>
      <Text style={styles.subtitle}>Confirm and generate your plans</Text>

      <View style={styles.card}>
        {dateStr ? (
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={20} color={Colors.gray600} />
            <Text style={styles.cardText}>
              {dateStr}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
          </View>
        ) : null}
        {locationDisplay ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={20} color={Colors.gray600} />
            <Text style={styles.cardText} numberOfLines={1}>{locationDisplay}</Text>
          </View>
        ) : null}
        {budgetStr ? (
          <View style={styles.row}>
            <Ionicons name="wallet-outline" size={20} color={Colors.gray600} />
            <Text style={styles.cardText}>Budget {budgetStr}</Text>
          </View>
        ) : null}
        {details.cuisine ? (
          <View style={styles.row}>
            <Ionicons name="restaurant-outline" size={20} color={Colors.gray600} />
            <Text style={styles.cardText}>{details.cuisine} cuisine</Text>
          </View>
        ) : null}
        {whoLabel ? (
          <View style={styles.row}>
            <Ionicons name="people-outline" size={20} color={Colors.gray600} />
            <Text style={styles.cardText}>{whoLabel}</Text>
          </View>
        ) : null}
        {activityLabel ? (
          <View style={styles.row}>
            <SparklesIcon size={20} color={Colors.primaryViolet} />
            <Text style={[styles.cardText, styles.activityText]}>{activityLabel}</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onGenerate();
        }}
        disabled={loading}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.generateBtnText}>Generate plans</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { ...Typography.caption, color: Colors.gray600, marginBottom: 24 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardText: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  activityText: { fontWeight: "600", color: Colors.primaryViolet },
  generateBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  generateBtnDisabled: { opacity: 0.7 },
  generateBtnText: { ...Typography.button, color: Colors.white },
});
