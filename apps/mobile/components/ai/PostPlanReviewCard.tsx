/**
 * Post-plan review — one quick, premium-feeling card shown once a plan's time has passed.
 * Captures an overall 1-5 rating plus a few optional structured signals and a free-text note,
 * then feeds the pair's behavior_affinity (recompute-behavior-ml / recompute-compatibility)
 * so future suggestions improve. Part of the AI-assistant redesign (D3) design system.
 */

import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Chip, PrimaryButton, TextButton } from "@/components/ds";
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

// Labels: concierge.review.rating.<1–5>, concierge.review.toggle.<key>.
type ToggleKey = "venueGood" | "timingGood" | "wouldRepeat";

const TOGGLES: { key: ToggleKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "venueGood", icon: "location-outline" },
  { key: "timingGood", icon: "time-outline" },
  { key: "wouldRepeat", icon: "repeat-outline" },
];

export function PostPlanReviewCard({ visible, review, onDone }: PostPlanReviewCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        <Text style={styles.eyebrow}>{t("concierge.review.title")}</Text>
        <TouchableOpacity onPress={() => void handleSkip()} hitSlop={10} accessibilityLabel={t("concierge.review.skipA11y")}>
          <Ionicons name="close" size={22} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {review.title}
      </Text>

      <View style={styles.starsRow}>
        <StarRating value={rating} onChange={setRating} size={34} />
      </View>
      {rating > 0 ? <Text style={styles.ratingLabel}>{t(`concierge.review.rating.${rating}`)}</Text> : null}

      <View style={styles.toggleRow}>
        {TOGGLES.map(({ key }) => {
          const active = toggles[key];
          return (
            <Chip
              key={key}
              label={t(`concierge.review.toggle.${key}`)}
              selected={active}
              onPress={() => setToggles((prev) => ({ ...prev, [key]: !prev[key] }))}
            />
          );
        })}
      </View>

      <TextInput
        style={styles.noteInput}
        placeholder={t("concierge.review.notePlaceholder")}
        placeholderTextColor={theme.colors.textMuted}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />

      <PrimaryButton
        title={t("concierge.review.submit")}
        onPress={() => void handleSubmit()}
        disabled={rating === 0}
        loading={submitting}
      />
      <TextButton title={t("concierge.skip")} onPress={() => void handleSkip()} disabled={submitting} style={styles.ghostBtn} />
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.xs,
    },
    eyebrow: {
      ...theme.type.caption,
      fontWeight: "800",
      color: theme.colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    title: {
      ...theme.type.h3,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.lg,
    },
    starsRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
    },
    ratingLabel: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
    },
    toggleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
      justifyContent: "center",
    },
    noteInput: {
      ...theme.type.body,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      minHeight: 64,
      textAlignVertical: "top",
      marginBottom: theme.spacing.lg,
    },
    ghostBtn: {
      marginTop: theme.spacing.xs,
      alignSelf: "center",
    },
  });
}
