/**
 * Weekly weekend ideas — "Your weekend ideas" (Fri/Sat/Sun).
 * Shown Thu evening – Sun. One card, one CTA to generate plans.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import type { WeeklyWeekendSuggestion } from "@/lib/ai/proactiveSuggestion";

export type WeeklyWeekendCardProps = {
  suggestion: WeeklyWeekendSuggestion;
  onViewPlans: () => void;
  onDismiss: () => void;
};

export function WeeklyWeekendCard({
  suggestion,
  onViewPlans,
  onDismiss,
}: WeeklyWeekendCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <SparklesIcon size={18} color={Colors.primaryViolet} />
          <Text style={styles.badgeText}>{suggestion.title}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); onDismiss(); }}
          hitSlop={12}
          style={styles.dismissBtn}
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={22} color={Colors.gray500} />
        </TouchableOpacity>
      </View>

      {suggestion.ideas.map((idea, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.day}>{idea.day}</Text>
          <Text style={styles.label}>{idea.label}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={styles.cta}
        onPress={() => { Haptics.selectionAsync(); onViewPlans(); }}
        activeOpacity={0.9}
      >
        <Text style={styles.ctaText}>Get weekend plans</Text>
        <Ionicons name="arrow-forward" size={20} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  day: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray600,
    width: 72,
  },
  label: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  ctaText: {
    ...Typography.button,
    color: Colors.white,
  },
});
