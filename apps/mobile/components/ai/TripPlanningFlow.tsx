/**
 * Trip intent mini-flow: collects scope, vibe, optional destination/radius, activity level, must-haves.
 * Who joins is collected later in ConciergeSocialStep.
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, Chip, PrimaryButton, TextButton } from "@/components/ds";
import {
  type ActivityDetails,
  type TripPlanningAnswers,
  type TripScope,
  type TripVibe,
  type ActivityLevel,
  type TravelRadius,
  tripAnswersToActivityDetails,
} from "@/lib/ai/conciergePlanningFlow";

export type TripPlanningFlowProps = {
  existingDetails: Partial<ActivityDetails>;
  onComplete: (merged: Partial<ActivityDetails>) => void;
  onBack: () => void;
};

type TripCardId =
  | "scope"
  | "vibe"
  | "destination_decided"
  | "activity_level"
  | "must_haves"
  | "travel_radius";

const SCOPE_OPTIONS: { id: TripScope; label: string; hint: string }[] = [
  { id: "own_city", label: "My city / area", hint: "Stay local" },
  { id: "nearby", label: "Nearby", hint: "Short hop away" },
  { id: "new_destination", label: "New destination", hint: "Further afield" },
];

const VIBE_OPTIONS: { id: TripVibe; label: string }[] = [
  { id: "culture", label: "Culture & history" },
  { id: "food", label: "Food & dining" },
  { id: "outdoors", label: "Outdoors & nature" },
  { id: "entertainment", label: "Shopping & entertainment" },
  { id: "mixed", label: "A bit of everything" },
];

const LEVEL_OPTIONS: { id: ActivityLevel; label: string }[] = [
  { id: "easy", label: "Easy-going" },
  { id: "moderate", label: "Moderate" },
  { id: "intense", label: "Packed / intense" },
];

const RADIUS_OPTIONS: { id: TravelRadius; label: string }[] = [
  { id: "1h", label: "Up to ~1 hour" },
  { id: "2-3h", label: "~2–3 hours" },
  { id: "3-5h", label: "~3–5 hours" },
  { id: "5h+", label: "5+ hours / flights OK" },
];

const MUST_HAVE_CHIPS: string[] = [
  "Great photo spots",
  "Kid-friendly",
  "Budget-conscious",
  "Luxury touches",
  "Walkable center",
  "Nature / parks",
  "Nightlife",
  "Local markets",
  "Museums",
  "Wellness / spa",
];

function visibleTripCards(a: Partial<TripPlanningAnswers>): TripCardId[] {
  const out: TripCardId[] = ["scope", "vibe"];
  if (a.scope === "new_destination") out.push("destination_decided");
  out.push("activity_level");
  if (a.scope === "new_destination" && a.destinationDecided === false) {
    out.push("must_haves", "travel_radius");
  }
  return out;
}

function buildCompleteAnswers(a: Partial<TripPlanningAnswers>): TripPlanningAnswers | null {
  if (!a.scope || !a.vibe || !a.activityLevel) return null;
  if (a.scope === "new_destination" && a.destinationDecided === undefined) return null;
  if (a.scope === "new_destination" && a.destinationDecided === false) {
    if (!a.travelRadius) return null;
  }
  return {
    scope: a.scope,
    vibe: a.vibe,
    activityLevel: a.activityLevel,
    mustHaves: a.mustHaves ?? [],
    destinationDecided: a.scope !== "new_destination" ? true : !!a.destinationDecided,
    travelRadius:
      a.scope === "new_destination" && a.destinationDecided === false ? a.travelRadius : undefined,
  };
}

export function TripPlanningFlow({ existingDetails, onComplete, onBack }: TripPlanningFlowProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [answers, setAnswers] = useState<Partial<TripPlanningAnswers>>({});
  const visible = useMemo(() => visibleTripCards(answers), [answers]);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const cardId = visible[stepIndex];
  const progressLabel = `${stepIndex + 1} / ${visible.length}`;

  const goNext = useCallback(() => {
    if (stepIndex >= visible.length - 1) {
      const done = buildCompleteAnswers(answers);
      if (!done) return;
      onComplete(tripAnswersToActivityDetails(done, existingDetails));
      return;
    }
    setStepIndex((i) => i + 1);
  }, [answers, existingDetails, onComplete, stepIndex, visible.length]);

  const canAdvance = useMemo(() => {
    switch (cardId) {
      case "scope":
        return !!answers.scope;
      case "vibe":
        return !!answers.vibe;
      case "destination_decided":
        return answers.destinationDecided !== undefined;
      case "activity_level":
        return !!answers.activityLevel;
      case "must_haves":
        return true;
      case "travel_radius":
        return !!answers.travelRadius;
      default:
        return false;
    }
  }, [answers, cardId]);

  const renderCard = () => {
    switch (cardId) {
      case "scope":
        return (
          <>
            <Text style={styles.cardTitle}>Where is this trip?</Text>
            <Text style={styles.cardSubtitle}>Pick what best describes your plan</Text>
            <View style={styles.optionCol}>
              {SCOPE_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.optionRow, answers.scope === o.id && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => {
                      const next = { ...prev, scope: o.id };
                      if (o.id !== "new_destination") {
                        delete next.destinationDecided;
                        delete next.travelRadius;
                        next.mustHaves = [];
                      }
                      return next;
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, answers.scope === o.id && styles.optionTitleActive]}>{o.label}</Text>
                    <Text style={styles.optionHint}>{o.hint}</Text>
                  </View>
                  {answers.scope === o.id ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case "vibe":
        return (
          <>
            <Text style={styles.cardTitle}>What vibe are you after?</Text>
            <View style={styles.chipsWrap}>
              {VIBE_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  label={o.label}
                  selected={answers.vibe === o.id}
                  onPress={() => setAnswers((prev) => ({ ...prev, vibe: o.id }))}
                />
              ))}
            </View>
          </>
        );
      case "destination_decided":
        return (
          <>
            <Text style={styles.cardTitle}>Do you already know where you’re going?</Text>
            <View style={styles.binaryRow}>
              <TouchableOpacity
                style={[styles.binaryBtn, answers.destinationDecided === true && styles.binaryBtnActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((prev) => ({
                    ...prev,
                    destinationDecided: true,
                    travelRadius: undefined,
                    mustHaves: [],
                  }));
                }}
              >
                <Text style={[styles.binaryText, answers.destinationDecided === true && styles.binaryTextActive]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.binaryBtn, answers.destinationDecided === false && styles.binaryBtnActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((prev) => ({ ...prev, destinationDecided: false }));
                }}
              >
                <Text style={[styles.binaryText, answers.destinationDecided === false && styles.binaryTextActive]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          </>
        );
      case "activity_level":
        return (
          <>
            <Text style={styles.cardTitle}>How intense should days be?</Text>
            <View style={styles.chipsWrap}>
              {LEVEL_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  label={o.label}
                  selected={answers.activityLevel === o.id}
                  onPress={() => setAnswers((prev) => ({ ...prev, activityLevel: o.id }))}
                />
              ))}
            </View>
          </>
        );
      case "must_haves":
        return (
          <>
            <Text style={styles.cardTitle}>Any must-haves?</Text>
            <Text style={styles.cardSubtitle}>Select any that apply — optional</Text>
            <View style={styles.chipsWrap}>
              {MUST_HAVE_CHIPS.map((label) => {
                const selected = answers.mustHaves?.includes(label);
                return (
                  <Chip
                    key={label}
                    label={label}
                    selected={selected}
                    onPress={() => {
                      setAnswers((prev) => {
                        const cur = prev.mustHaves ?? [];
                        const next = selected ? cur.filter((x) => x !== label) : [...cur, label];
                        return { ...prev, mustHaves: next };
                      });
                    }}
                  />
                );
              })}
            </View>
          </>
        );
      case "travel_radius":
        return (
          <>
            <Text style={styles.cardTitle}>How far are you willing to travel?</Text>
            <View style={styles.optionCol}>
              {RADIUS_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.optionRow, answers.travelRadius === o.id && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, travelRadius: o.id }));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.optionTitle, answers.travelRadius === o.id && styles.optionTitleActive]}>{o.label}</Text>
                  {answers.travelRadius === o.id ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TextButton
        title="Back"
        icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
        onPress={onBack}
        style={styles.backRow}
      />

      <Text style={styles.title}>Plan your trip</Text>
      <Text style={styles.progress}>{progressLabel}</Text>

      <Card style={styles.card} elevation={1}>{renderCard()}</Card>

      <PrimaryButton
        title={stepIndex >= visible.length - 1 ? "Continue to details" : "Next"}
        onPress={goNext}
        disabled={!canAdvance}
      />
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.sm, paddingLeft: 0 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    progress: { ...theme.type.caption, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
    card: {
      marginBottom: theme.spacing.lg,
    },
    cardTitle: { ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    cardSubtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
    optionCol: { gap: theme.spacing.sm },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundMuted,
    },
    optionRowActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    optionTitle: { ...theme.type.body, color: theme.colors.textPrimary, fontWeight: "600" },
    optionTitleActive: { color: theme.colors.primary },
    optionHint: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 2 },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    binaryRow: { flexDirection: "row", gap: theme.spacing.md },
    binaryBtn: {
      flex: 1,
      paddingVertical: theme.spacing.lg,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    binaryBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
    binaryText: { ...theme.type.body, color: theme.colors.textSecondary, fontWeight: "600" },
    binaryTextActive: { color: theme.colors.primary },
  });
}
