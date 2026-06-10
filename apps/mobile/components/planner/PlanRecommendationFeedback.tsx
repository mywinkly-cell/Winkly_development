/**
 * Unobtrusive 1-tap thumb up/down for AI plan recommendations.
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import {
  savePlanRecommendationFeedback,
  type PlanRecommendationRating,
} from "@/lib/ai/planRecommendationFeedback";
import type { Mode } from "@/types";

export type PlanRecommendationFeedbackProps = {
  planSummary: string;
  mode: Mode;
  aiRequestId?: string;
  plannerItemId?: string;
  /** Shown beside the thumb buttons. */
  label?: string;
  /** When set, component renders read-only (already submitted). */
  initialRating?: PlanRecommendationRating | null;
  compact?: boolean;
};

export function PlanRecommendationFeedback({
  planSummary,
  mode,
  aiRequestId,
  plannerItemId,
  label = "Did this meet your expectations?",
  initialRating = null,
  compact = false,
}: PlanRecommendationFeedbackProps) {
  const [rating, setRating] = useState<PlanRecommendationRating | null>(initialRating);
  const [saving, setSaving] = useState(false);

  const handleRate = async (next: PlanRecommendationRating) => {
    if (rating || saving) return;
    Haptics.selectionAsync();
    setSaving(true);
    setRating(next);
    try {
      await savePlanRecommendationFeedback({
        rating: next,
        planSummary,
        mode,
        aiRequestId,
        plannerItemId,
      });
    } catch {
      setRating(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
        {rating ? "Thanks for the feedback" : label}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => handleRate("up")}
          style={[styles.btn, rating === "up" && styles.btnUpActive]}
          disabled={!!rating || saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Thumbs up — plan met expectations"
          accessibilityState={{ selected: rating === "up", disabled: !!rating }}
        >
          <Ionicons
            name={rating === "up" ? "thumbs-up" : "thumbs-up-outline"}
            size={compact ? 18 : 20}
            color={rating === "up" ? Colors.successGreen : Colors.gray500}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleRate("down")}
          style={[styles.btn, rating === "down" && styles.btnDownActive]}
          disabled={!!rating || saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Thumbs down — plan did not meet expectations"
          accessibilityState={{ selected: rating === "down", disabled: !!rating }}
        >
          <Ionicons
            name={rating === "down" ? "thumbs-down" : "thumbs-down-outline"}
            size={compact ? 18 : 20}
            color={rating === "down" ? Colors.errorRed : Colors.gray500}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  wrapCompact: {
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: {
    ...Typography.caption,
    color: Colors.gray600,
    flex: 1,
  },
  labelCompact: {
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  btnUpActive: {
    borderColor: Colors.successGreen,
    backgroundColor: "#E8F8EC",
  },
  btnDownActive: {
    borderColor: Colors.errorRed,
    backgroundColor: "#FDECEA",
  },
});
