/**
 * Proactive AI Concierge — one suggestion card at top of Planner.
 * Title, subtitle, activities, time range; View plan, Invite someone, Dismiss.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { ProactiveSuggestion } from "@/lib/ai/proactiveSuggestion";

export type ProactiveSuggestionCardProps = {
  suggestion: ProactiveSuggestion;
  /** Accent color for card border/icon (e.g. tab mode color). */
  accentColor?: string;
  onViewPlan: () => void;
  onInviteSomeone: () => void;
  onDismiss: () => void;
};

export function ProactiveSuggestionCard({
  suggestion,
  accentColor = Colors.primaryViolet,
  onViewPlan,
  onInviteSomeone,
  onDismiss,
}: ProactiveSuggestionCardProps) {
  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: accentColor + "18" }]}>
          <SparklesIcon size={18} color={accentColor} />
          <Text style={[styles.badgeText, { color: accentColor }]}>Winkly suggestion</Text>
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

      <Text style={styles.title}>{suggestion.title}</Text>
      <Text style={styles.subtitle}>{suggestion.subtitle}</Text>

      <View style={styles.activities}>
        {suggestion.activities.map((a, i) => (
          <View key={i} style={styles.activityRow}>
            <Ionicons name="ellipse" size={6} color={accentColor} style={styles.bullet} />
            <Text style={styles.activityText}>{a}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.timeRange}>{suggestion.timeRange}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: accentColor }]}
          onPress={() => { Haptics.selectionAsync(); onViewPlan(); }}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>View plan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => { Haptics.selectionAsync(); onInviteSomeone(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={20} color={accentColor} />
          <Text style={[styles.secondaryBtnText, { color: accentColor }]}>Invite someone</Text>
        </TouchableOpacity>
      </View>
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
    borderColor: Colors.gray200,
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
    marginBottom: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  dismissBtn: { padding: 4 },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 12,
  },
  activities: { marginBottom: 8 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  bullet: { marginRight: 8 },
  activityText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  timeRange: {
    ...Typography.caption,
    color: Colors.gray500,
    marginBottom: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    ...Typography.caption,
    fontWeight: "600",
  },
});
