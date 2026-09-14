/**
 * Post-plan review — one quick, premium-feeling card shown once a plan's time has passed.
 * Captures an overall 1-5 rating plus a few optional structured signals and a free-text note,
 * then feeds the pair's behavior_affinity (recompute-behavior-ml / recompute-compatibility)
 * so future suggestions improve. Part of the AI-assistant redesign (D3) design system.
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { Modal } from "@/components/ui/Modal";
import { StarRating } from "@/components/planner/StarRating";
import {
  savePostPlanReview,
  dismissPostPlanReview,
  timeOfDayFromIso,
  type PendingPlanReview,
} from "@/lib/ai/planRecommendationFeedback";

export type PostPlanReviewCardProps = {
  visible: boolean;
  review: PendingPlanReview | null;
  onDone: () => void;
};

const RATING_LABELS: Record<number, string> = {
  1: "Not for me",
  2: "Could be better",
  3: "It was okay",
  4: "Really good",
  5: "Loved it",
};

type ToggleKey = "venueGood" | "timingGood" | "wouldRepeat";

const TOGGLES: { key: ToggleKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "venueGood", label: "Good venue", icon: "location-outline" },
  { key: "timingGood", label: "Good timing", icon: "time-outline" },
  { key: "wouldRepeat", label: "Would repeat", icon: "repeat-outline" },
];

export function PostPlanReviewCard({ visible, review, onDone }: PostPlanReviewCardProps) {
  const [rating, setRating] = useState(0);
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    venueGood: false,
    timingGood: false,
    wouldRepeat: false,
  });
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRating(0);
    setToggles({ venueGood: false, timingGood: false, wouldRepeat: false });
    setNote("");
    setSubmitting(false);
  };

  const handleSkip = async () => {
    if (!review) return;
    Haptics.selectionAsync();
    await dismissPostPlanReview(review.plannerItemId);
    reset();
    onDone();
  };

  const handleSubmit = async () => {
    if (!review || rating === 0 || submitting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitting(true);
    try {
      await savePostPlanReview({
        plannerItemId: review.plannerItemId,
        mode: review.mode,
        rating,
        signals: {
          venueGood: toggles.venueGood || null,
          timingGood: toggles.timingGood || null,
          wouldRepeat: toggles.wouldRepeat || null,
        },
        note,
        activityType: review.activityType,
        venue: review.venue,
        timeOfDay: timeOfDayFromIso(review.endsAt),
        relatedUserId: review.relatedUserId,
      });
    } finally {
      reset();
      onDone();
    }
  };

  if (!review) return null;

  return (
    <Modal visible={visible} onClose={() => void handleSkip()} variant="sheet">
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>How was it?</Text>
        <TouchableOpacity onPress={() => void handleSkip()} hitSlop={10} accessibilityLabel="Skip review">
          <Ionicons name="close" size={22} color={Colors.gray500} />
        </TouchableOpacity>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {review.title}
      </Text>

      <View style={styles.starsRow}>
        <StarRating value={rating} onChange={setRating} size={34} />
      </View>
      {rating > 0 ? <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text> : null}

      <View style={styles.toggleRow}>
        {TOGGLES.map(({ key, label, icon }) => {
          const active = toggles[key];
          return (
            <TouchableOpacity
              key={key}
              onPress={() => {
                Haptics.selectionAsync();
                setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
              }}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={icon} size={14} color={active ? Colors.white : Colors.gray600} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        style={styles.noteInput}
        placeholder="Anything else? (optional)"
        placeholderTextColor={Colors.gray500}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />

      <TouchableOpacity
        onPress={() => void handleSubmit()}
        disabled={rating === 0 || submitting}
        style={[styles.primaryBtn, (rating === 0 || submitting) && styles.primaryBtnDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.primaryText}>Submit review</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void handleSkip()} style={styles.ghostBtn} disabled={submitting}>
        <Text style={styles.ghostText}>Skip</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  eyebrow: {
    ...Typography.caption,
    fontWeight: "800",
    color: Colors.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    ...Typography.h3,
    fontFamily: FontFamily.headingBold,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 6,
  },
  ratingLabel: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  chipActive: { backgroundColor: Colors.primaryViolet },
  chipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "500" },
  chipTextActive: { color: Colors.white },
  noteInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 64,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    ...Shadow.button,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryText: {
    ...Typography.button,
    color: Colors.white,
    fontFamily: FontFamily.headingBold,
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostText: {
    ...Typography.button,
    color: Colors.gray600,
    fontWeight: "600",
  },
});
