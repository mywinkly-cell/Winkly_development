/**
 * A plan someone actually ran, offered alongside AI-generated options.
 *
 * Visually distinct from an AI option on purpose — "3 people did this" is a
 * different kind of claim from "the AI suggests this", and blurring the two
 * would cost trust the first time a community plan disappoints.
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppTheme } from "@/constants/design-system";
import { Card, PrimaryButton } from "@/components/ds";
import { StarRating } from "@/components/planner/StarRating";
import {
  listPlanRatings,
  incrementPlanReuse,
  type CommunityPlan,
  type PlanRating,
} from "@/lib/ai/sharedPlans";

export type CommunityPlanCardProps = {
  plan: CommunityPlan;
  /** Called when the user picks this plan instead of an AI option. */
  onUse?: (plan: CommunityPlan) => void;
  useLabel?: string;
};

type Skeleton = {
  venue?: { name?: string; address?: string };
  itinerary?: { time?: string; description?: string }[];
  duration_minutes?: number;
};

export function CommunityPlanCard({ plan, onUse, useLabel: useLabelProp }: CommunityPlanCardProps) {
  const { t } = useTranslation();
  const useLabel = useLabelProp ?? t("concierge.community.useThisPlan");
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState<PlanRating[] | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const skeleton = (plan.planJson ?? {}) as Skeleton;
  const steps = Array.isArray(skeleton.itinerary) ? skeleton.itinerary : [];

  const toggle = async () => {
    Haptics.selectionAsync();
    const next = !expanded;
    setExpanded(next);
    if (next && reviews === null && plan.ratingCount > 0) {
      setLoadingReviews(true);
      try {
        setReviews(await listPlanRatings(plan.id, 5));
      } finally {
        setLoadingReviews(false);
      }
    }
  };

  const handleUse = () => {
    incrementPlanReuse(plan.id);
    onUse?.(plan);
  };

  const withComments = (reviews ?? []).filter((r) => r.comment?.trim());

  return (
    <Card style={styles.card} elevation={0}>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="people" size={12} color={theme.colors.primary} />
          <Text style={styles.badgeText}>{t("concierge.community.triedByOthers")}</Text>
        </View>
        {plan.reuseCount > 0 ? (
          <Text style={styles.reuse}>{t("concierge.community.usedCount", { count: plan.reuseCount })}</Text>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {plan.title}
      </Text>

      <StarRating value={plan.ratingAvg} count={plan.ratingCount} size={16} showValue />

      {plan.summary ? (
        <Text style={styles.summary} numberOfLines={expanded ? undefined : 3}>
          {plan.summary}
        </Text>
      ) : null}

      {skeleton.venue?.name ? (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>
            {skeleton.venue.name}
            {skeleton.venue.address ? ` · ${skeleton.venue.address}` : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <Ionicons name="person-circle-outline" size={14} color={theme.colors.textSecondary} />
        <Text style={styles.meta}>{plan.authorLabel}</Text>
        {plan.numDays > 1 ? (
          <Text style={styles.meta}>· {t("concierge.details.days", { count: plan.numDays })}</Text>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.details}>
          {steps.length > 0 ? (
            <View style={styles.itinerary}>
              {steps.map((step, i) => (
                <View key={`${step.time ?? i}-${i}`} style={styles.step}>
                  <Text style={styles.stepTime}>{step.time ?? "—"}</Text>
                  <Text style={styles.stepText}>{step.description ?? ""}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {loadingReviews ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : withComments.length > 0 ? (
            <View style={styles.reviews}>
              <Text style={styles.reviewsTitle}>{t("concierge.community.whatPeopleSaid")}</Text>
              {withComments.map((r) => (
                <View key={r.id} style={styles.review}>
                  <StarRating value={r.stars} size={12} />
                  <Text style={styles.reviewText}>{r.comment}</Text>
                  {r.wasAdjusted ? (
                    <Text style={styles.adjusted}>{t("concierge.community.adjusted")}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={toggle}
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t("concierge.community.hideDetails") : t("concierge.community.showDetails")}
        >
          <Text style={styles.secondaryText}>{expanded ? t("concierge.community.less") : t("concierge.community.details")}</Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={theme.colors.primary}
          />
        </TouchableOpacity>

        {onUse ? (
          <View style={styles.primaryBtnWrap}>
            <PrimaryButton title={useLabel} onPress={handleUse} accessibilityLabel={useLabel} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    card: {
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      gap: theme.spacing.sm,
      marginVertical: theme.spacing.sm,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: theme.modeAccent("events").bg,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.pill,
    },
    badgeText: {
      ...theme.type.caption,
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.primary,
    },
    reuse: {
      ...theme.type.caption,
      fontSize: 11,
      color: theme.colors.textSecondary,
    },
    title: {
      ...theme.type.h3,
      color: theme.colors.textPrimary,
    },
    summary: {
      ...theme.type.body,
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    meta: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      flexShrink: 1,
    },
    details: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    itinerary: { gap: theme.spacing.sm },
    step: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    stepTime: {
      ...theme.type.caption,
      fontWeight: "600",
      color: theme.colors.primary,
      width: 52,
    },
    stepText: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      flex: 1,
    },
    reviews: { gap: theme.spacing.sm },
    reviewsTitle: {
      ...theme.type.caption,
      fontWeight: "600",
      color: theme.colors.textPrimary,
    },
    review: {
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.sm,
    },
    reviewText: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
    },
    adjusted: {
      ...theme.type.caption,
      fontSize: 11,
      color: theme.colors.textSecondary,
      fontStyle: "italic",
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryText: {
      ...theme.type.caption,
      fontWeight: "600",
      color: theme.colors.primary,
    },
    primaryBtnWrap: { flex: 1 },
  });
}
