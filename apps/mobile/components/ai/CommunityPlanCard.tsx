/**
 * A plan someone actually ran, offered alongside AI-generated options.
 *
 * Visually distinct from an AI option on purpose — "3 people did this" is a
 * different kind of claim from "the AI suggests this", and blurring the two
 * would cost trust the first time a community plan disappoints.
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
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

export function CommunityPlanCard({ plan, onUse, useLabel = "Use this plan" }: CommunityPlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState<PlanRating[] | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const skeleton = (plan.planJson ?? {}) as Skeleton;
  const steps = Array.isArray(skeleton.itinerary) ? skeleton.itinerary : [];

  const toggle = async () => {
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
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="people" size={12} color={Colors.primaryViolet} />
          <Text style={styles.badgeText}>Tried by others</Text>
        </View>
        {plan.reuseCount > 0 ? (
          <Text style={styles.reuse}>Used {plan.reuseCount}×</Text>
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
          <Ionicons name="location-outline" size={14} color={Colors.gray600} />
          <Text style={styles.meta} numberOfLines={1}>
            {skeleton.venue.name}
            {skeleton.venue.address ? ` · ${skeleton.venue.address}` : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <Ionicons name="person-circle-outline" size={14} color={Colors.gray600} />
        <Text style={styles.meta}>{plan.authorLabel}</Text>
        {plan.numDays > 1 ? (
          <Text style={styles.meta}>· {plan.numDays} days</Text>
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
            <ActivityIndicator size="small" color={Colors.primaryViolet} />
          ) : withComments.length > 0 ? (
            <View style={styles.reviews}>
              <Text style={styles.reviewsTitle}>What people said</Text>
              {withComments.map((r) => (
                <View key={r.id} style={styles.review}>
                  <StarRating value={r.stars} size={12} />
                  <Text style={styles.reviewText}>{r.comment}</Text>
                  {r.wasAdjusted ? (
                    <Text style={styles.adjusted}>Adjusted before doing it</Text>
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
          accessibilityLabel={expanded ? "Hide plan details" : "Show plan details"}
        >
          <Text style={styles.secondaryText}>{expanded ? "Less" : "Details"}</Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={Colors.primaryViolet}
          />
        </TouchableOpacity>

        {onUse ? (
          <TouchableOpacity
            onPress={handleUse}
            style={styles.primaryBtn}
            accessibilityRole="button"
            accessibilityLabel={useLabel}
          >
            <Text style={styles.primaryText}>{useLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.primaryViolet,
    padding: 16,
    gap: 8,
    marginVertical: 8,
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
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "600",
    color: Colors.primaryViolet,
  },
  reuse: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.gray600,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  summary: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  meta: {
    ...Typography.caption,
    color: Colors.gray600,
    flexShrink: 1,
  },
  details: {
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  itinerary: { gap: 8 },
  step: {
    flexDirection: "row",
    gap: 10,
  },
  stepTime: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.primaryViolet,
    width: 52,
  },
  stepText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  reviews: { gap: 10 },
  reviewsTitle: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  review: {
    gap: 4,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 10,
  },
  reviewText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  adjusted: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.gray600,
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  secondaryText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.primaryViolet,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    ...Typography.button,
    color: Colors.onPrimary,
  },
});
