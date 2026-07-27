/**
 * Post-plan rating card — shown once a plan's end time has passed.
 *
 * Deliberately staged: stars first, everything else only after they're tapped.
 * Asking for a comment and a sharing decision up front is how you train people
 * to dismiss the prompt.
 *
 * The "I changed it" toggle matters more than it looks: an adjusted 5-star tells
 * you the skeleton was right but the specifics weren't — which is exactly the
 * signal you want before offering the plan to someone else.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import { StarRating } from "@/components/planner/StarRating";
import { ratePlan, setPlanVisibility, type SharedPlan } from "@/lib/ai/sharedPlans";

export type PlanRatingPromptProps = {
  plan: SharedPlan;
  onDone?: (stars: number) => void;
  onDismiss?: () => void;
};

export function PlanRatingPrompt({ plan, onDone, onDismiss }: PlanRatingPromptProps) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [wasAdjusted, setWasAdjusted] = useState(false);
  const [share, setShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (stars < 1 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await ratePlan({
        sharedPlanId: plan.id,
        stars,
        comment,
        wasAdjusted,
        plannerItemId: plan.sourcePlannerItemId,
      });
      if (share) {
        // Anonymous by default. Named attribution is a separate, explicit choice
        // the user makes in their own plans list — not buried in a rating flow.
        await setPlanVisibility(plan.id, "community", { display: "anonymous" });
      }
      setSubmitted(true);
      onDone?.(stars);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your rating.");
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.successGreen} />
        <Text style={styles.doneText}>
          {share ? "Thanks — shared so others can use it too." : "Thanks for the feedback."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            How was {plan.title}?
          </Text>
          <Text style={styles.subtitle}>Your rating helps us suggest better plans.</Text>
        </View>
        {onDismiss ? (
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss rating prompt"
          >
            <Ionicons name="close" size={20} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </View>

      <StarRating value={stars} onChange={setStars} size={30} />

      {stars > 0 ? (
        <View style={styles.expanded}>
          <TextInput
            style={styles.input}
            placeholder="Anything worth knowing? (optional)"
            placeholderTextColor={Colors.gray500}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            accessibilityLabel="Optional comment about this plan"
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>I changed the plan before doing it</Text>
            <Switch
              value={wasAdjusted}
              onValueChange={setWasAdjusted}
              trackColor={{ true: Colors.primaryViolet, false: Colors.gray300 }}
              accessibilityLabel="I changed the plan before doing it"
            />
          </View>

          {stars >= 4 ? (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Share it so others can use it (anonymously)</Text>
              <Switch
                value={share}
                onValueChange={setShare}
                trackColor={{ true: Colors.primaryViolet, false: Colors.gray300 }}
                accessibilityLabel="Share this plan anonymously"
              />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submit, saving && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Submit rating"
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
    marginVertical: 8,
  },
  cardDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  doneText: {
    ...Typography.body,
    color: Colors.textSecondary,
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  expanded: { gap: 12 },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 12,
    minHeight: 72,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  error: {
    ...Typography.caption,
    color: Colors.errorRed,
  },
  submit: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    ...Typography.button,
    color: Colors.onPrimary,
  },
});
