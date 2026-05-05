/**
 * Chat experience suggestion card — shown in 1:1 Romance/Friends/Business chat for paid users.
 * Title, mini itinerary, duration; Plan date, Suggest another, Share.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Share } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { ChatExperienceSuggestion } from "@/lib/ai/chatExperienceSuggestion";

export type ChatExperienceSuggestionCardProps = {
  suggestion: ChatExperienceSuggestion;
  /** Mode for copy and accent (romance / friends / business) */
  mode: "romance" | "friends" | "business";
  onPlanDate: () => void;
  onSuggestAnother: () => void;
};

const MODE_ACCENT: Record<string, string> = {
  romance: Colors.romance.primary,
  friends: Colors.friends?.primary ?? Colors.primaryViolet,
  business: Colors.business?.primary ?? Colors.primaryViolet,
};

export function ChatExperienceSuggestionCard({
  suggestion,
  mode,
  onPlanDate,
  onSuggestAnother,
}: ChatExperienceSuggestionCardProps) {
  const accent = MODE_ACCENT[mode] ?? Colors.primaryViolet;

  const handleShare = async () => {
    Haptics.selectionAsync();
    const text = [suggestion.title, ...suggestion.itinerary.map((i) => `${i.time ?? ""} ${i.time ? " " : ""}${i.activity}`.trim()), `Est. ${suggestion.estimatedDuration}`].filter(Boolean).join("\n");
    try {
      await Share.share({ message: text, title: suggestion.title });
    } catch {
      // user dismissed
    }
  };

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={[styles.badge, { backgroundColor: accent + "18" }]}>
        <SparklesIcon size={16} color={accent} />
        <Text style={[styles.badgeText, { color: accent }]}>Winkly suggestion</Text>
      </View>

      <Text style={styles.title}>{suggestion.title}</Text>
      {suggestion.subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{suggestion.subtitle}</Text> : null}

      <View style={styles.itinerary}>
        {suggestion.itinerary.map((step, i) => (
          <View key={i} style={styles.itineraryRow}>
            {step.time ? <Text style={styles.time}>{step.time}</Text> : null}
            <Text style={styles.activity}>{step.activity}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.duration}>Estimated duration {suggestion.estimatedDuration}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: accent }]}
          onPress={() => { Haptics.selectionAsync(); onPlanDate(); }}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>{mode === "romance" ? "Plan date" : mode === "business" ? "Schedule meeting" : "Add to planner"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => { Haptics.selectionAsync(); onSuggestAnother(); }} activeOpacity={0.8}>
          <Text style={[styles.secondaryBtnText, { color: accent }]}>Suggest another plan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tertiaryBtn} onPress={handleShare} activeOpacity={0.8}>
          <Ionicons name="share-outline" size={20} color={Colors.gray600} />
          <Text style={styles.tertiaryBtnText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 10,
  },
  itinerary: {
    marginBottom: 8,
  },
  itineraryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 10,
  },
  time: {
    ...Typography.caption,
    color: Colors.gray500,
    minWidth: 40,
  },
  activity: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  duration: {
    ...Typography.caption,
    color: Colors.gray500,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.white,
    fontSize: 14,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  tertiaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tertiaryBtnText: {
    ...Typography.caption,
    color: Colors.gray600,
  },
});
