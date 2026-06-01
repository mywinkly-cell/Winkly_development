/**
 * DateIdeasSuggestions — Winkly's activity-planning differentiator.
 *
 * Shows 3 one-tap date-idea suggestions at the top of a new match conversation,
 * derived from the two users' overlapping activity preferences. Tapping a chip
 * opens the propose-date form (InviteToPlanModal) pre-filled with that activity.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { DateIdea } from "@/lib/dates/dateIdeas";

export type DateIdeasSuggestionsProps = {
  ideas: DateIdea[];
  /** Accent color (romance primary). */
  accent: string;
  /** Tapping an idea opens the propose-date form prefilled with `activity`. */
  onPick: (idea: DateIdea) => void;
  onDismiss?: () => void;
};

export function DateIdeasSuggestions({ ideas, accent, onPick, onDismiss }: DateIdeasSuggestionsProps) {
  if (!ideas.length) return null;
  const anyShared = ideas.some((i) => i.shared);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="heart-circle-outline" size={16} color={accent} />
        <Text style={[styles.headerText, { color: accent }]} numberOfLines={1}>
          {anyShared ? "Date ideas you both might like" : "Break the ice with a plan"}
        </Text>
        {onDismiss ? (
          <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss date ideas">
            <Ionicons name="close" size={16} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {ideas.map((idea) => (
          <TouchableOpacity
            key={idea.key}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync();
              onPick(idea);
            }}
            style={[styles.chip, { borderColor: accent + "55", backgroundColor: accent + "0F" }]}
          >
            <Ionicons name={idea.icon as keyof typeof Ionicons.glyphMap} size={18} color={accent} />
            <Text style={styles.chipText} numberOfLines={1}>{idea.activity}</Text>
            {idea.shared ? <View style={[styles.sharedDot, { backgroundColor: accent }]} /> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  headerText: {
    ...Typography.caption,
    fontWeight: "700",
    flex: 1,
  },
  row: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
  },
  chipText: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  sharedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
});
